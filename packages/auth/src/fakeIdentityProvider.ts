import type { IdentityProvider, VerifiedIdentity } from './types.ts'

/**
 * A stand-in for Google that tests drive over plain HTTP: the callback's `code` picks which
 * prepared identity signs in, and `state` must match, as it would with the real thing.
 * @param identitiesByCode - The identity each authorization code signs in as.
 * @returns An identity provider that never touches the network.
 */
export const createFakeIdentityProvider = (
  identitiesByCode: Readonly<Record<string, VerifiedIdentity>>
): IdentityProvider => {
  let attempt = 0
  return {
    createAuthorizationRequest: () => {
      attempt += 1
      return Promise.resolve({
        url: `https://accounts.example.com/authorize?attempt=${attempt}`,
        state: `state-${attempt}`,
        nonce: `nonce-${attempt}`,
        codeVerifier: `verifier-${attempt}`
      })
    },
    exchangeCallback: (callbackUrl, checks) => {
      const code = callbackUrl.searchParams.get('code') ?? ''
      const identity = Object.hasOwn(identitiesByCode, code) ? identitiesByCode[code] : undefined
      if (callbackUrl.searchParams.get('state') !== checks.state || !identity) {
        return Promise.reject(new Error('The callback does not match the sign-in attempt'))
      }
      return Promise.resolve(identity)
    }
  }
}
