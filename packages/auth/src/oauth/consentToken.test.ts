import { describe, expect, it } from 'vitest'
import { createSessionValue } from '../sessionCookies.ts'
import { createConsentToken, verifyConsentToken } from './consentToken.ts'
import type { AuthorizationRequestFields } from './types.ts'

const SECRET = 'a-session-secret-that-is-long-enough-1234'
const NOW = 1_700_000_000_000
const TEN_MINUTES = 10 * 60 * 1000

const fields: AuthorizationRequestFields = {
  clientId: 'client-1',
  redirectUri: 'http://localhost:1234/cb',
  codeChallenge: 'c'.repeat(43),
  state: 'xyz',
  resource: 'https://designo.example.com/mcp'
}

describe('consent token', () => {
  it('is accepted for the account and the request it was made for', () => {
    const token = createConsentToken(fields, 'account-1', NOW, SECRET)
    expect(verifyConsentToken(token, fields, 'account-1', NOW, SECRET)).toBe(true)
  })

  it('is refused for another account', () => {
    const token = createConsentToken(fields, 'account-1', NOW, SECRET)
    expect(verifyConsentToken(token, fields, 'account-2', NOW, SECRET)).toBe(false)
  })

  it.each([
    ['client', { clientId: 'client-2' }],
    ['redirect URI', { redirectUri: 'http://localhost:9999/cb' }],
    ['code challenge', { codeChallenge: 'd'.repeat(43) }],
    ['state', { state: 'other' }],
    ['missing state', { state: undefined }],
    ['resource', { resource: undefined }]
  ])('is refused when the %s was changed after the page was shown', (_label, change) => {
    const token = createConsentToken(fields, 'account-1', NOW, SECRET)
    expect(verifyConsentToken(token, { ...fields, ...change }, 'account-1', NOW, SECRET)).toBe(
      false
    )
  })

  it('cannot be built by splicing fields together to collide with another request', () => {
    const token = createConsentToken(
      { ...fields, clientId: 'a', redirectUri: 'bc' },
      'account-1',
      NOW,
      SECRET
    )
    expect(
      verifyConsentToken(
        token,
        { ...fields, clientId: 'ab', redirectUri: 'c' },
        'account-1',
        NOW,
        SECRET
      )
    ).toBe(false)
  })

  it('lives ten minutes', () => {
    const token = createConsentToken(fields, 'account-1', NOW, SECRET)
    expect(verifyConsentToken(token, fields, 'account-1', NOW + TEN_MINUTES - 1, SECRET)).toBe(true)
    expect(verifyConsentToken(token, fields, 'account-1', NOW + TEN_MINUTES, SECRET)).toBe(false)
  })

  it('is refused when signed with another secret, forged or empty', () => {
    const token = createConsentToken(fields, 'account-1', NOW, SECRET)
    expect(verifyConsentToken(token, fields, 'account-1', NOW, 'another secret')).toBe(false)
    expect(verifyConsentToken('forged.value', fields, 'account-1', NOW, SECRET)).toBe(false)
    expect(verifyConsentToken('', fields, 'account-1', NOW, SECRET)).toBe(false)
  })

  it('is refused when it is really a session cookie value', () => {
    const session = createSessionValue('account-1', 0, NOW, SECRET)
    expect(verifyConsentToken(session, fields, 'account-1', NOW, SECRET)).toBe(false)
  })
})
