import { createHash } from 'node:crypto'
import { z } from 'zod'
import { accountIdSchema } from '../schemas.ts'
import { constantTimeEqual, signValue, verifySignedValue } from '../signedValues.ts'
import type { AuthorizationRequestFields } from './types.ts'

const CONSENT_PURPOSE = 'consent'
const CONSENT_LIFETIME_MINUTES = 10
const MILLISECONDS_PER_MINUTE = 60_000
const CONSENT_LIFETIME_MILLISECONDS = CONSENT_LIFETIME_MINUTES * MILLISECONDS_PER_MINUTE

const consentClaimsSchema = z.object({
  accountId: accountIdSchema,
  requestDigest: z.string(),
  expiresAt: z.number()
})

// JSON of an array, so two different requests cannot produce the same text by moving characters
// from one field into the next.
const digestOfRequest = (fields: AuthorizationRequestFields): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        fields.clientId,
        fields.redirectUri,
        fields.codeChallenge,
        fields.state ?? null,
        fields.resource ?? null
      ])
    )
    .digest('hex')

/**
 * Makes the CSRF token that goes into the consent form. It is signed, tied to the signed-in
 * account and to exactly the request on the page, so a form built by another site, or edited to
 * point somewhere else, does not carry a token that passes.
 * @param fields - The authorization request the consent page shows.
 * @param accountId - Who is looking at the page.
 * @param now - The current time in epoch milliseconds.
 * @param secret - The session secret.
 * @returns The token to put in a hidden field.
 */
export const createConsentToken = (
  fields: AuthorizationRequestFields,
  accountId: string,
  now: number,
  secret: string
): string =>
  signValue(
    CONSENT_PURPOSE,
    {
      accountId,
      requestDigest: digestOfRequest(fields),
      expiresAt: now + CONSENT_LIFETIME_MILLISECONDS
    },
    secret
  )

/**
 * Checks the token that came back with a consent decision.
 * @param token - The hidden field's value.
 * @param fields - The authorization request as the form sent it back.
 * @param accountId - Who is signed in now.
 * @param now - The current time in epoch milliseconds.
 * @param secret - The session secret.
 * @returns True only for an unexpired token made for this account and exactly this request.
 */
export const verifyConsentToken = (
  token: string,
  fields: AuthorizationRequestFields,
  accountId: string,
  now: number,
  secret: string
): boolean => {
  const claims = consentClaimsSchema.safeParse(verifySignedValue(CONSENT_PURPOSE, token, secret))
  return (
    claims.success &&
    claims.data.expiresAt > now &&
    claims.data.accountId === accountId &&
    constantTimeEqual(claims.data.requestDigest, digestOfRequest(fields))
  )
}
