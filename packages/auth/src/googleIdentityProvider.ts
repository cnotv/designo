import { createRemoteJWKSet, jwtVerify } from 'jose'
import * as client from 'openid-client'
import { z } from 'zod'
import type {
  AuthorizationChecks,
  AuthorizationRequest,
  GoogleIdentityProviderOptions,
  IdentityProvider,
  VerifiedIdentity
} from './types.ts'

export const GOOGLE_ISSUER = 'https://accounts.google.com'

const SCOPE = 'openid email profile'
const CODE_CHALLENGE_METHOD = 'S256'
// Google signs its ID tokens with RS256; naming it stops a token from choosing a weaker algorithm.
const ID_TOKEN_ALGORITHMS = ['RS256']

// Google has sent email_verified as a boolean and, in the past, as the text "true".
const emailVerifiedSchema = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((text) => text === 'true')])
  .default(false)

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: emailVerifiedSchema,
  name: z.string().default('')
})

const identityFromClaims = (claims: unknown): VerifiedIdentity => {
  const parsed = claimsSchema.parse(claims)
  return {
    subject: parsed.sub,
    email: parsed.email,
    emailVerified: parsed.email_verified,
    name: parsed.name
  }
}

interface DiscoveredProvider {
  configuration: client.Configuration
  publicKeys: ReturnType<typeof createRemoteJWKSet>
}

/**
 * Sign-in with Google through `openid-client`, which does the state, nonce and PKCE checks and
 * validates the ID token's claims. `jose` then verifies the token's signature against the keys
 * Google publishes, because the client library trusts a token that arrives straight from the
 * token endpoint over TLS and this server wants the signature proved as well.
 * Discovery happens on the first sign-in, so the server starts without network access, and a
 * failed discovery is retried by the next attempt.
 * @param options - The OAuth client, the redirect URI and, for tests, another issuer.
 * @returns The identity provider.
 */
export const createGoogleIdentityProvider = (
  options: GoogleIdentityProviderOptions
): IdentityProvider => {
  const issuer = new URL(options.issuer ?? GOOGLE_ISSUER)
  let pendingDiscovery: Promise<DiscoveredProvider> | undefined

  const discover = async (): Promise<DiscoveredProvider> => {
    const configuration = await client.discovery(
      issuer,
      options.clientId,
      options.clientSecret,
      undefined,
      options.allowInsecureIssuer ? { execute: [client.allowInsecureRequests] } : undefined
    )
    const { jwks_uri: keysUrl } = configuration.serverMetadata()
    if (!keysUrl) throw new Error('The identity provider publishes no signing keys')
    return { configuration, publicKeys: createRemoteJWKSet(new URL(keysUrl)) }
  }

  const loadProvider = (): Promise<DiscoveredProvider> => {
    pendingDiscovery ??= discover().catch((error: unknown) => {
      pendingDiscovery = undefined
      throw error
    })
    return pendingDiscovery
  }

  return {
    createAuthorizationRequest: async (): Promise<AuthorizationRequest> => {
      const { configuration } = await loadProvider()
      const checks: AuthorizationChecks = {
        state: client.randomState(),
        nonce: client.randomNonce(),
        codeVerifier: client.randomPKCECodeVerifier()
      }
      const url = client.buildAuthorizationUrl(configuration, {
        redirect_uri: options.redirectUri,
        scope: SCOPE,
        state: checks.state,
        nonce: checks.nonce,
        code_challenge: await client.calculatePKCECodeChallenge(checks.codeVerifier),
        code_challenge_method: CODE_CHALLENGE_METHOD
      })
      return { ...checks, url: url.href }
    },
    exchangeCallback: async (callbackUrl, checks): Promise<VerifiedIdentity> => {
      const { configuration, publicKeys } = await loadProvider()
      // The token request must repeat the exact redirect URI, so it is rebuilt from the setting
      // rather than from whatever host the request claimed to be for.
      const redirectUri = new URL(options.redirectUri)
      const callbackWithConfiguredOrigin = new URL(
        `${redirectUri.origin}${redirectUri.pathname}${callbackUrl.search}`
      )
      const tokens = await client.authorizationCodeGrant(
        configuration,
        callbackWithConfiguredOrigin,
        {
          pkceCodeVerifier: checks.codeVerifier,
          expectedState: checks.state,
          expectedNonce: checks.nonce,
          idTokenExpected: true
        }
      )
      if (!tokens.id_token) throw new Error('The identity provider sent no ID token')
      const { payload } = await jwtVerify(tokens.id_token, publicKeys, {
        issuer: configuration.serverMetadata().issuer,
        audience: options.clientId,
        algorithms: ID_TOKEN_ALGORITHMS
      })
      return identityFromClaims(payload)
    }
  }
}
