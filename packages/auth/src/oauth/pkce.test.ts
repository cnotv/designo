import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isWellFormedCodeChallenge, verifyCodeChallengeS256 } from './pkce.ts'

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

describe('verifyCodeChallengeS256', () => {
  it('accepts the verifier the challenge was made from', () => {
    expect(verifyCodeChallengeS256(VERIFIER, CHALLENGE)).toBe(true)
  })

  it('matches the example in RFC 7636', () => {
    expect(
      verifyCodeChallengeS256(
        'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
      )
    ).toBe(true)
  })

  it('refuses another verifier', () => {
    expect(verifyCodeChallengeS256(`${VERIFIER}x`, CHALLENGE)).toBe(false)
  })

  it('refuses the challenge itself sent as the verifier, which is what the plain method does', () => {
    expect(verifyCodeChallengeS256(CHALLENGE, CHALLENGE)).toBe(false)
  })

  it('refuses a verifier that is too short or has characters the RFC does not allow', () => {
    expect(verifyCodeChallengeS256('short', CHALLENGE)).toBe(false)
    expect(verifyCodeChallengeS256(`${VERIFIER}!`, CHALLENGE)).toBe(false)
  })
})

describe('isWellFormedCodeChallenge', () => {
  it('accepts 43 base64url characters', () => {
    expect(isWellFormedCodeChallenge(CHALLENGE)).toBe(true)
  })

  it.each(['', 'abc', `${CHALLENGE}=`, `${CHALLENGE}a`, 'a+b/'.padEnd(43, 'a')])(
    'refuses %j',
    (value) => {
      expect(isWellFormedCodeChallenge(value)).toBe(false)
    }
  )
})
