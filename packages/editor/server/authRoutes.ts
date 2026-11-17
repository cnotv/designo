import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  LOGIN_COOKIE_NAME,
  LOGIN_COOKIE_PATH,
  LOGIN_LIFETIME_SECONDS,
  constantTimeEqual,
  createLoginValue,
  isAdminAccount,
  parseCookies,
  readLoginValue,
  serializeClearedCookie,
  serializeCookie,
  type LoginAttempt
} from '@designo/auth'
import {
  accountFromRequest,
  clearedSessionCookie,
  revokeRequestSessions,
  sessionCookieFor
} from './authentication.ts'
import { crossSiteProblem, sendError, sendNoContent, sendOk, sendRedirect } from './http.ts'
import type { AuthContext } from './types.ts'

export const AUTH_START_ROUTE = '/auth/google'
export const AUTH_CALLBACK_ROUTE = '/auth/google/callback'
export const LOGOUT_ROUTE = '/auth/logout'
export const ME_ROUTE = '/api/me'

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405

// The editor reads this and says the sign-in did not work; the cause stays in the server's log.
const SIGN_IN_FAILED_LOCATION = '/?sign_in=failed'

type RouteHandler = (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void>

// Only the error's name and code are logged: a library's message can quote a response body.
const logSignInProblem = (what: string, error: unknown): void => {
  const name = error instanceof Error ? error.name : 'unknown error'
  const code = error instanceof Error && 'code' in error ? ` (${String(error.code)})` : ''
  console.error(`${what}: ${name}${code}`)
}

const loginCookieOptions = (context: AuthContext) => ({
  secure: context.settings.secureCookies,
  path: LOGIN_COOKIE_PATH
})

const failSignIn = (context: AuthContext, response: ServerResponse): void => {
  response.setHeader(
    'Set-Cookie',
    serializeClearedCookie(LOGIN_COOKIE_NAME, loginCookieOptions(context))
  )
  sendRedirect(response, SIGN_IN_FAILED_LOCATION)
}

const startSignIn: RouteHandler = async (context, _request, response) => {
  const authorization = await context.identityProvider
    .createAuthorizationRequest()
    .catch((error: unknown) => {
      logSignInProblem('Sign-in could not start', error)
      return undefined
    })
  if (!authorization) {
    failSignIn(context, response)
    return
  }
  response.setHeader(
    'Set-Cookie',
    serializeCookie(
      LOGIN_COOKIE_NAME,
      createLoginValue(authorization, context.clock(), context.settings.sessionSecret),
      { ...loginCookieOptions(context), maxAgeSeconds: LOGIN_LIFETIME_SECONDS }
    )
  )
  sendRedirect(response, authorization.url)
}

// The callback belongs to the attempt this browser started: its signed cookie must be present,
// unexpired and carry the same state as the URL, and each attempt can come back only once.
const claimLoginAttempt = (
  context: AuthContext,
  request: IncomingMessage,
  callbackUrl: URL
): LoginAttempt | undefined => {
  const value = parseCookies(request.headers.cookie).get(LOGIN_COOKIE_NAME)
  const attempt = value
    ? readLoginValue(value, context.clock(), context.settings.sessionSecret)
    : undefined
  const state = callbackUrl.searchParams.get('state')
  if (!attempt || !state || !constantTimeEqual(state, attempt.state)) return undefined
  return context.replayGuard.consume(attempt.state, attempt.expiresAt) ? attempt : undefined
}

// Built from the configured public URL, never from the Host header the request claims.
const callbackUrlOf = (context: AuthContext, request: IncomingMessage): URL => {
  const query = (request.url ?? '').split('?').slice(1).join('?')
  return new URL(`${AUTH_CALLBACK_ROUTE}?${query}`, context.settings.publicUrl)
}

const finishSignIn: RouteHandler = async (context, request, response) => {
  const callbackUrl = callbackUrlOf(context, request)
  const attempt = claimLoginAttempt(context, request, callbackUrl)
  const identity = attempt
    ? await context.identityProvider
        .exchangeCallback(callbackUrl, attempt)
        .catch((error: unknown) => {
          logSignInProblem('Sign-in was refused', error)
          return undefined
        })
    : undefined
  if (!identity) {
    failSignIn(context, response)
    return
  }
  const account = await context.accountStore.signIn(identity, context.settings, context.clock())
  response.setHeader('Set-Cookie', [
    sessionCookieFor(context, account),
    serializeClearedCookie(LOGIN_COOKIE_NAME, loginCookieOptions(context))
  ])
  sendRedirect(response, '/')
}

// Clearing the cookie only helps this browser, so sign-out also raises the account's session
// epoch: a copy of the cookie stops working too.
const signOut: RouteHandler = async (context, request, response) => {
  const problem = crossSiteProblem(request)
  if (problem) {
    sendError(response, HTTP_FORBIDDEN, problem)
    return
  }
  await revokeRequestSessions(context, request)
  response.setHeader('Set-Cookie', clearedSessionCookie(context))
  sendNoContent(response)
}

const describeMe: RouteHandler = async (context, request, response) => {
  const account = await accountFromRequest(context, request)
  if (!account) {
    sendError(response, HTTP_UNAUTHORIZED, 'Not signed in')
    return
  }
  sendOk(response, {
    email: account.email,
    name: account.name,
    status: account.status,
    isAdmin: isAdminAccount(account, context.settings.adminEmails)
  })
}

const routes: Readonly<Record<string, { method: string; handle: RouteHandler }>> = {
  [AUTH_START_ROUTE]: { method: 'GET', handle: startSignIn },
  [AUTH_CALLBACK_ROUTE]: { method: 'GET', handle: finishSignIn },
  [LOGOUT_ROUTE]: { method: 'POST', handle: signOut },
  [ME_ROUTE]: { method: 'GET', handle: describeMe }
}

/**
 * Answers the sign-in routes: Google redirect and callback, sign-out and `/api/me`.
 * @param context - The sign-in settings, provider and account store.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @param pathname - The request path without its query.
 * @returns True when the path was one of these routes and has been answered.
 */
export const handleAuthRoute = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
): Promise<boolean> => {
  const route = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined
  if (!route) return false
  if (request.method === route.method) {
    await route.handle(context, request, response)
  } else {
    sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
  }
  return true
}
