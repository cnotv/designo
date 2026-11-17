import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_LIFETIME_SECONDS,
  createSessionValue,
  parseCookies,
  readSessionValue,
  serializeClearedCookie,
  serializeCookie,
  type Account
} from '@designo/auth'
import { sendError } from './http.ts'
import type { AuthContext } from './types.ts'

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

/**
 * Finds who a request is from. The cookie only says which account and which session epoch; the
 * account is read from the store every time, so blocking someone takes effect on their very next
 * request, and so does signing out: it raised the epoch, which the cookie no longer matches.
 * @param context - The sign-in settings and the account store.
 * @param request - The incoming request.
 * @returns The account, or undefined for no cookie, a forged, tampered, expired or revoked one.
 */
export const accountFromRequest = async (
  context: AuthContext,
  request: IncomingMessage
): Promise<Account | undefined> => {
  const value = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME)
  if (!value) return undefined
  const claims = readSessionValue(value, context.clock(), context.settings.sessionSecret)
  const account = claims ? await context.accountStore.findById(claims.accountId) : undefined
  return account && account.sessionEpoch === claims?.epoch ? account : undefined
}

/**
 * Ends every session of the account a request is signed in as, copies of its cookie included.
 * @param context - The sign-in settings and the account store.
 * @param request - The incoming request.
 * @returns Nothing; a request that is not signed in changes nothing.
 */
export const revokeRequestSessions = async (
  context: AuthContext,
  request: IncomingMessage
): Promise<void> => {
  const account = await accountFromRequest(context, request)
  if (account) await context.accountStore.revokeSessions(account.id)
}

/**
 * Builds the header that signs an account in.
 * @param context - The sign-in settings.
 * @param account - Who signed in.
 * @returns The `Set-Cookie` value.
 */
export const sessionCookieFor = (context: AuthContext, account: Account): string =>
  serializeCookie(
    SESSION_COOKIE_NAME,
    createSessionValue(
      account.id,
      account.sessionEpoch,
      context.clock(),
      context.settings.sessionSecret
    ),
    {
      maxAgeSeconds: SESSION_LIFETIME_SECONDS,
      secure: context.settings.secureCookies,
      path: SESSION_COOKIE_PATH
    }
  )

/**
 * Builds the header that signs out.
 * @param context - The sign-in settings.
 * @returns The `Set-Cookie` value.
 */
export const clearedSessionCookie = (context: AuthContext): string =>
  serializeClearedCookie(SESSION_COOKIE_NAME, {
    secure: context.settings.secureCookies,
    path: SESSION_COOKIE_PATH
  })

/**
 * Says why a request may not use Designo: nobody is signed in, or the account is blocked or
 * still waiting for approval.
 * @param response - Where the answer goes.
 * @param account - Who the request is from, or undefined when nobody is signed in.
 */
export const sendAccountRefusal = (
  response: ServerResponse,
  account: Account | undefined
): void => {
  if (!account) {
    sendError(response, HTTP_UNAUTHORIZED, 'Sign in to use Designo')
    return
  }
  const message =
    account.status === 'blocked'
      ? 'This account is blocked'
      : 'This account is waiting for approval'
  sendError(response, HTTP_FORBIDDEN, message)
}
