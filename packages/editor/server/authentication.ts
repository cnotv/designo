import type { IncomingMessage } from 'node:http'
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
import type { AuthContext } from './types.ts'

/**
 * Finds who a request is from. The cookie only says which account; the account's status is read
 * from the store every time, so blocking someone takes effect on their very next request.
 * @param context - The sign-in settings and the account store.
 * @param request - The incoming request.
 * @returns The account, or undefined for no cookie or a forged, tampered or expired one.
 */
export const accountFromRequest = async (
  context: AuthContext,
  request: IncomingMessage
): Promise<Account | undefined> => {
  const value = parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME)
  if (!value) return undefined
  const claims = readSessionValue(value, context.clock(), context.settings.sessionSecret)
  return claims ? context.accountStore.findById(claims.accountId) : undefined
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
    createSessionValue(account.id, context.clock(), context.settings.sessionSecret),
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
