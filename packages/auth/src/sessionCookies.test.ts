import { describe, expect, it } from 'vitest'
import {
  LOGIN_COOKIE_PATH,
  SESSION_COOKIE_PATH,
  createLoginValue,
  createSessionValue,
  parseCookies,
  readLoginValue,
  readSessionValue,
  serializeClearedCookie,
  serializeCookie
} from './sessionCookies.ts'
import { signValue, verifySignedValue } from './signedValues.ts'

const SECRET = 'a-session-secret-that-is-long-enough-1234'
const OTHER_SECRET = 'another-session-secret-that-is-long-5678'
const NOW = 1_700_000_000_000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

describe('signed values', () => {
  it('round-trips a payload for the same purpose and secret', () => {
    const value = signValue('thing', { a: 1 }, SECRET)
    expect(verifySignedValue('thing', value, SECRET)).toEqual({ a: 1 })
  })

  it('rejects a value signed with another secret', () => {
    expect(verifySignedValue('thing', signValue('thing', { a: 1 }, OTHER_SECRET), SECRET)).toBe(
      undefined
    )
  })

  it('rejects a value made for another purpose', () => {
    expect(verifySignedValue('other', signValue('thing', { a: 1 }, SECRET), SECRET)).toBe(undefined)
  })

  it('rejects a tampered body, a tampered signature and malformed text', () => {
    const [body = '', signature = ''] = signValue('thing', { a: 1 }, SECRET).split('.')
    const forgedBody = Buffer.from(
      JSON.stringify({ purpose: 'thing', payload: { a: 2 } })
    ).toString('base64url')
    expect(verifySignedValue('thing', `${forgedBody}.${signature}`, SECRET)).toBe(undefined)
    expect(verifySignedValue('thing', `${body}.${signature}x`, SECRET)).toBe(undefined)
    expect(verifySignedValue('thing', `${body}.`, SECRET)).toBe(undefined)
    expect(verifySignedValue('thing', body, SECRET)).toBe(undefined)
    expect(verifySignedValue('thing', `${body}.${signature}.extra`, SECRET)).toBe(undefined)
    expect(verifySignedValue('thing', '', SECRET)).toBe(undefined)
    expect(verifySignedValue('thing', '.', SECRET)).toBe(undefined)
  })
})

describe('session value', () => {
  it('carries the account id until seven days from now', () => {
    const value = createSessionValue('account-1', 0, NOW, SECRET)
    expect(readSessionValue(value, NOW + 1000, SECRET)).toEqual({
      accountId: 'account-1',
      epoch: 0,
      expiresAt: NOW + SEVEN_DAYS
    })
  })

  it('carries the session epoch it was made at', () => {
    const value = createSessionValue('account-1', 3, NOW, SECRET)
    expect(readSessionValue(value, NOW, SECRET)?.epoch).toBe(3)
  })

  it('is refused when it has no epoch, as a cookie from before epochs would not', () => {
    const value = signValue(
      'session',
      { accountId: 'account-1', expiresAt: NOW + SEVEN_DAYS },
      SECRET
    )
    expect(readSessionValue(value, NOW, SECRET)).toBeUndefined()
  })

  it('is signed-out once expired', () => {
    const value = createSessionValue('account-1', 0, NOW, SECRET)
    expect(readSessionValue(value, NOW + SEVEN_DAYS, SECRET)).toBeUndefined()
    expect(readSessionValue(value, NOW + SEVEN_DAYS + 1, SECRET)).toBeUndefined()
  })

  it('is signed-out when signed with another secret', () => {
    expect(
      readSessionValue(createSessionValue('account-1', 0, NOW, OTHER_SECRET), NOW, SECRET)
    ).toBeUndefined()
  })

  it('is signed-out for a forged value that names an account without a signature', () => {
    const forged = Buffer.from(
      JSON.stringify({
        purpose: 'session',
        payload: { accountId: 'account-1', expiresAt: NOW + SEVEN_DAYS }
      })
    ).toString('base64url')
    expect(readSessionValue(`${forged}.AAAA`, NOW, SECRET)).toBeUndefined()
  })

  it('is not accepted when it is really a login value', () => {
    const login = createLoginValue({ state: 's', nonce: 'n', codeVerifier: 'v' }, NOW, SECRET)
    expect(readSessionValue(login, NOW, SECRET)).toBeUndefined()
  })

  it('refuses an account id that is not a safe folder name', () => {
    const value = signValue(
      'session',
      { accountId: '../other', epoch: 0, expiresAt: NOW + SEVEN_DAYS },
      SECRET
    )
    expect(readSessionValue(value, NOW, SECRET)).toBeUndefined()
  })
})

describe('login value', () => {
  const checks = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' }

  it('carries the checks for ten minutes', () => {
    const value = createLoginValue(checks, NOW, SECRET)
    expect(readLoginValue(value, NOW + 9 * 60 * 1000, SECRET)).toMatchObject(checks)
    expect(readLoginValue(value, NOW + 10 * 60 * 1000, SECRET)).toBeUndefined()
  })

  it('carries where to go back to, inside the signature', () => {
    const value = createLoginValue(checks, NOW, SECRET, '/authorize?client_id=abc')
    expect(readLoginValue(value, NOW, SECRET)?.returnTo).toBe('/authorize?client_id=abc')
    expect(
      readLoginValue(createLoginValue(checks, NOW, SECRET), NOW, SECRET)?.returnTo
    ).toBeUndefined()
    expect(readLoginValue(value, NOW, 'another secret')).toBeUndefined()
  })

  it('is not accepted when it is really a session value', () => {
    expect(
      readLoginValue(createSessionValue('account-1', 0, NOW, SECRET), NOW, SECRET)
    ).toBeUndefined()
  })
})

describe('cookie headers', () => {
  it('parses a cookie header and lets the first of a repeated name win', () => {
    const cookies = parseCookies('a=1; b=two=2; a=3; broken')
    expect(cookies.get('a')).toBe('1')
    expect(cookies.get('b')).toBe('two=2')
    expect(cookies.has('broken')).toBe(false)
    expect(parseCookies(undefined).size).toBe(0)
  })

  it('sets HttpOnly, SameSite=Lax and Secure', () => {
    expect(
      serializeCookie('designo_session', 'value', {
        maxAgeSeconds: 60,
        secure: true,
        path: SESSION_COOKIE_PATH
      })
    ).toBe('designo_session=value; Max-Age=60; Path=/; HttpOnly; SameSite=Lax; Secure')
  })

  it('leaves Secure off only when asked, and clears with a zero lifetime', () => {
    expect(
      serializeClearedCookie('designo_login', { secure: false, path: LOGIN_COOKIE_PATH })
    ).toBe('designo_login=; Max-Age=0; Path=/auth/google; HttpOnly; SameSite=Lax')
  })
})
