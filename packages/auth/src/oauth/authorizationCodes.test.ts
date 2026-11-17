import { describe, expect, it } from 'vitest'
import { createAuthorizationCodeStore } from './authorizationCodes.ts'
import type { AuthorizationCodeDetails } from './types.ts'

const details: AuthorizationCodeDetails = {
  clientId: 'client-1',
  redirectUri: 'http://localhost:1234/cb',
  codeChallenge: 'c'.repeat(43),
  accountId: 'account-1',
  resource: 'https://designo.example.com/mcp'
}

const SIXTY_SECONDS = 60_000

describe('createAuthorizationCodeStore', () => {
  it('redeems a code once, with what it was bound to', () => {
    const store = createAuthorizationCodeStore(() => 0)
    const code = store.issue(details)
    expect(store.redeem(code)).toEqual({ kind: 'redeemed', details })
  })

  it('makes a different unguessable code each time', () => {
    const store = createAuthorizationCodeStore(() => 0)
    const codes = new Set([store.issue(details), store.issue(details), store.issue(details)])
    expect(codes.size).toBe(3)
    expect([...codes].every((code) => code.length >= 43)).toBe(true)
  })

  it('does not know a code it never issued', () => {
    expect(createAuthorizationCodeStore(() => 0).redeem('guess')).toEqual({ kind: 'unknown' })
  })

  it('says a second redemption is a replay and hands back the grant it produced', () => {
    const store = createAuthorizationCodeStore(() => 0)
    const code = store.issue(details)
    store.redeem(code)
    store.recordGrant(code, 'grant-9')
    expect(store.redeem(code)).toEqual({ kind: 'replayed', grantId: 'grant-9' })
  })

  it('says a replay produced no grant when none was recorded', () => {
    const store = createAuthorizationCodeStore(() => 0)
    const code = store.issue(details)
    store.redeem(code)
    expect(store.redeem(code)).toEqual({ kind: 'replayed', grantId: undefined })
  })

  it('lets a code live for sixty seconds and no longer', () => {
    const time = { now: 0 }
    const store = createAuthorizationCodeStore(() => time.now)
    const code = store.issue(details)
    time.now = SIXTY_SECONDS - 1
    expect(store.redeem(code).kind).toBe('redeemed')
    const late = store.issue(details)
    time.now += SIXTY_SECONDS
    expect(store.redeem(late)).toEqual({ kind: 'unknown' })
  })

  it('keeps a bounded number of codes, dropping the oldest', () => {
    const store = createAuthorizationCodeStore(() => 0, 2)
    const first = store.issue(details)
    store.issue(details)
    store.issue(details)
    expect(store.redeem(first)).toEqual({ kind: 'unknown' })
  })
})
