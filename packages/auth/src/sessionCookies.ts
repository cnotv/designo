import { loginAttemptSchema, sessionClaimsSchema } from './schemas.ts'
import { signValue, verifySignedValue } from './signedValues.ts'
import type { AuthorizationChecks, CookieOptions, LoginAttempt, SessionClaims } from './types.ts'

export const SESSION_COOKIE_NAME = 'designo_session'
export const LOGIN_COOKIE_NAME = 'designo_login'

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const SESSION_LIFETIME_DAYS = 7
const LOGIN_LIFETIME_MINUTES = 10
const SESSION_LIFETIME_MILLISECONDS =
  SESSION_LIFETIME_DAYS *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND
const LOGIN_LIFETIME_MILLISECONDS =
  LOGIN_LIFETIME_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND

const SESSION_PURPOSE = 'session'
const LOGIN_PURPOSE = 'login'

export const SESSION_COOKIE_PATH = '/'
// The callback is the only route that needs the login cookie, so nothing else receives it.
export const LOGIN_COOKIE_PATH = '/auth/google'

export const SESSION_LIFETIME_SECONDS = SESSION_LIFETIME_MILLISECONDS / MILLISECONDS_PER_SECOND
export const LOGIN_LIFETIME_SECONDS = LOGIN_LIFETIME_MILLISECONDS / MILLISECONDS_PER_SECOND

/**
 * Makes the session cookie's value: the account id and when the session ends, signed.
 * @param accountId - The signed-in account.
 * @param now - The current time in epoch milliseconds.
 * @param secret - The session secret.
 * @returns The value to put in the cookie.
 */
export const createSessionValue = (accountId: string, now: number, secret: string): string => {
  const claims: SessionClaims = { accountId, expiresAt: now + SESSION_LIFETIME_MILLISECONDS }
  return signValue(SESSION_PURPOSE, claims, secret)
}

/**
 * Reads a session cookie's value.
 * @param value - The cookie's value.
 * @param now - The current time in epoch milliseconds.
 * @param secret - The session secret.
 * @returns The claims, or undefined when the value is forged, tampered, malformed or expired.
 */
export const readSessionValue = (
  value: string,
  now: number,
  secret: string
): SessionClaims | undefined => {
  const claims = sessionClaimsSchema.safeParse(verifySignedValue(SESSION_PURPOSE, value, secret))
  return claims.success && claims.data.expiresAt > now ? claims.data : undefined
}

/**
 * Makes the short-lived cookie that carries a sign-in attempt's state, nonce and PKCE verifier
 * across the round trip to Google.
 * @param checks - What the attempt must find again when Google redirects back.
 * @param now - The current time in epoch milliseconds.
 * @param secret - The session secret.
 * @returns The value to put in the cookie.
 */
export const createLoginValue = (
  checks: AuthorizationChecks,
  now: number,
  secret: string
): string => {
  const attempt: LoginAttempt = { ...checks, expiresAt: now + LOGIN_LIFETIME_MILLISECONDS }
  return signValue(LOGIN_PURPOSE, attempt, secret)
}

/**
 * Reads a sign-in attempt's cookie value.
 * @param value - The cookie's value.
 * @param now - The current time in epoch milliseconds.
 * @param secret - The session secret.
 * @returns The attempt, or undefined when the value is forged, malformed or too old.
 */
export const readLoginValue = (
  value: string,
  now: number,
  secret: string
): LoginAttempt | undefined => {
  const attempt = loginAttemptSchema.safeParse(verifySignedValue(LOGIN_PURPOSE, value, secret))
  return attempt.success && attempt.data.expiresAt > now ? attempt.data : undefined
}

/**
 * Reads the cookies a request sent. When a name repeats, the first wins: browsers list the most
 * specific path first.
 * @param header - The `Cookie` request header.
 * @returns The cookies by name.
 */
export const parseCookies = (header: string | undefined): ReadonlyMap<string, string> => {
  const pairs = (header ?? '').split(';').flatMap((part): [string, string][] => {
    const separator = part.indexOf('=')
    return separator === -1
      ? []
      : [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()]]
  })
  return new Map(pairs.toReversed())
}

/**
 * Builds a `Set-Cookie` header value: HttpOnly, SameSite=Lax, and Secure unless on localhost.
 * @param name - The cookie name.
 * @param value - The cookie value; base64url text, so it needs no escaping.
 * @param options - Lifetime, path and the Secure flag.
 * @returns The header value.
 */
export const serializeCookie = (name: string, value: string, options: CookieOptions): string =>
  [
    `${name}=${value}`,
    `Max-Age=${options.maxAgeSeconds}`,
    `Path=${options.path}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(options.secure ? ['Secure'] : [])
  ].join('; ')

/**
 * Builds a `Set-Cookie` header value that makes the browser drop a cookie.
 * @param name - The cookie name.
 * @param options - Path and Secure flag the cookie was set with.
 * @returns The header value.
 */
export const serializeClearedCookie = (
  name: string,
  options: Omit<CookieOptions, 'maxAgeSeconds'>
): string => serializeCookie(name, '', { ...options, maxAgeSeconds: 0 })
