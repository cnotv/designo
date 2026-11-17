import { createHash } from 'node:crypto'
import { constantTimeEqual } from '../signedValues.ts'

// RFC 7636: a verifier is 43 to 128 unreserved characters, and an S256 challenge is the 43
// characters of a base64url SHA-256.
const VERIFIER_PATTERN = /^[\w.~-]{43,128}$/
const CHALLENGE_PATTERN = /^[\w-]{43}$/

/**
 * Says whether a string can be an S256 code challenge.
 * @param value - The `code_challenge` parameter.
 * @returns True for 43 base64url characters.
 */
export const isWellFormedCodeChallenge = (value: string): boolean => CHALLENGE_PATTERN.test(value)

/**
 * Checks a PKCE code verifier against the S256 challenge it was promised for.
 * @param codeVerifier - The `code_verifier` from the token request.
 * @param codeChallenge - The `code_challenge` from the authorization request.
 * @returns True only when SHA-256 of the verifier is the challenge.
 */
export const verifyCodeChallengeS256 = (codeVerifier: string, codeChallenge: string): boolean =>
  VERIFIER_PATTERN.test(codeVerifier) &&
  constantTimeEqual(createHash('sha256').update(codeVerifier).digest('base64url'), codeChallenge)
