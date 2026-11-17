import {
  createHash,
  createSign,
  generateKeyPairSync,
  type JsonWebKey,
  type KeyObject
} from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { text } from 'node:stream/consumers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGoogleIdentityProvider } from './googleIdentityProvider.ts'
import type { AuthorizationChecks, IdentityProvider } from './types.ts'

const CLIENT_ID = 'client-id.example.com'
const CLIENT_SECRET = 'client-secret-for-the-stand-in'
const REDIRECT_URI = 'https://designo.example.com/auth/google/callback'
const KEY_ID = 'test-key'

const portOf = (server: Server): number => {
  const address = server.address()
  return typeof address === 'object' && address ? address.port : 0
}

const base64Url = (value: Buffer | string): string => Buffer.from(value).toString('base64url')

const createSigningKeys = (): { privateKey: KeyObject; publicJwk: JsonWebKey } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { privateKey, publicJwk: { ...publicKey.export({ format: 'jwk' }), kid: KEY_ID } }
}

const signIdToken = (claims: Record<string, unknown>, privateKey: KeyObject): string => {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KEY_ID }))
  const body = base64Url(JSON.stringify(claims))
  const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey)
  return `${header}.${body}.${base64Url(signature)}`
}

interface TokenRequest {
  form: URLSearchParams
}

interface StandIn {
  issuer: string
  tokenRequests: TokenRequest[]
  discoveryRequests: () => number
  /** What the next token response's ID token says, on top of valid defaults. */
  setIdTokenClaims: (claims: Record<string, unknown>) => void
  setSigningKey: (key: KeyObject) => void
  omitIdToken: () => void
  close: () => Promise<void>
}

const startStandInIssuer = async (): Promise<StandIn> => {
  const { privateKey, publicJwk } = createSigningKeys()
  const state: {
    claims: Record<string, unknown>
    key: KeyObject
    withIdToken: boolean
    discoveries: number
  } = {
    claims: {},
    key: privateKey,
    withIdToken: true,
    discoveries: 0
  }
  const tokenRequests: TokenRequest[] = []
  const server: Server = createServer((request, response) => {
    void (async () => {
      const issuer = `http://127.0.0.1:${portOf(server)}`
      const url = new URL(request.url ?? '/', issuer)
      const send = (status: number, body: unknown): void => {
        response.writeHead(status, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      if (url.pathname === '/.well-known/openid-configuration') {
        state.discoveries += 1
        send(200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256']
        })
        return
      }
      if (url.pathname === '/jwks') {
        send(200, { keys: [publicJwk] })
        return
      }
      if (url.pathname === '/token' && request.method === 'POST') {
        const form = new URLSearchParams(await text(request))
        tokenRequests.push({ form })
        const now = Math.floor(Date.now() / 1000)
        const claims = {
          iss: issuer,
          aud: CLIENT_ID,
          sub: 'google-sub-1',
          email: 'person@example.com',
          email_verified: true,
          name: 'Person One',
          iat: now,
          exp: now + 300,
          ...state.claims
        }
        send(200, {
          access_token: 'access-token',
          token_type: 'Bearer',
          ...(state.withIdToken ? { id_token: signIdToken(claims, state.key) } : {})
        })
        return
      }
      send(404, { error: 'not found' })
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    issuer: `http://127.0.0.1:${portOf(server)}`,
    tokenRequests,
    discoveryRequests: () => state.discoveries,
    setIdTokenClaims: (claims) => {
      state.claims = claims
    },
    setSigningKey: (key) => {
      state.key = key
    },
    omitIdToken: () => {
      state.withIdToken = false
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

let standIn: StandIn
let provider: IdentityProvider

beforeEach(async () => {
  standIn = await startStandInIssuer()
  provider = createGoogleIdentityProvider({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    issuer: standIn.issuer,
    allowInsecureIssuer: true
  })
})

afterEach(async () => {
  await standIn.close()
})

const callbackUrlFor = (state: string): URL =>
  new URL(`${REDIRECT_URI}?code=the-code&state=${encodeURIComponent(state)}`)

// The stand-in puts the nonce the provider sent into the ID token, as a real issuer does.
const startAttempt = async (): Promise<{ checks: AuthorizationChecks; callbackUrl: URL }> => {
  const request = await provider.createAuthorizationRequest()
  standIn.setIdTokenClaims({ nonce: request.nonce })
  return { checks: request, callbackUrl: callbackUrlFor(request.state) }
}

describe('Google identity provider', () => {
  it('does not touch the network until the first sign-in', async () => {
    expect(standIn.discoveryRequests()).toBe(0)
    await provider.createAuthorizationRequest()
    expect(standIn.discoveryRequests()).toBe(1)
    await provider.createAuthorizationRequest()
    expect(standIn.discoveryRequests()).toBe(1)
  })

  it('retries discovery on the next attempt when it failed', async () => {
    const unreachable = createGoogleIdentityProvider({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
      issuer: 'http://127.0.0.1:1',
      allowInsecureIssuer: true
    })
    await expect(unreachable.createAuthorizationRequest()).rejects.toThrow()
    await expect(unreachable.createAuthorizationRequest()).rejects.toThrow()
  })

  it('builds a request with state, nonce, an S256 PKCE challenge and the redirect URI', async () => {
    const request = await provider.createAuthorizationRequest()
    const url = new URL(request.url)
    expect(url.origin + url.pathname).toBe(`${standIn.issuer}/authorize`)
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe(request.state)
    expect(url.searchParams.get('nonce')).toBe(request.nonce)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(request.codeVerifier).digest('base64url')
    )
    expect(request.url).not.toContain(CLIENT_SECRET)
    expect(request.url).not.toContain(request.codeVerifier)
  })

  it('makes a fresh state, nonce and verifier every time', async () => {
    const first = await provider.createAuthorizationRequest()
    const second = await provider.createAuthorizationRequest()
    expect(second.state).not.toBe(first.state)
    expect(second.nonce).not.toBe(first.nonce)
    expect(second.codeVerifier).not.toBe(first.codeVerifier)
  })

  it('exchanges the callback for the verified identity and sends the PKCE verifier', async () => {
    const { checks, callbackUrl } = await startAttempt()
    expect(await provider.exchangeCallback(callbackUrl, checks)).toEqual({
      subject: 'google-sub-1',
      email: 'person@example.com',
      emailVerified: true,
      name: 'Person One'
    })
    const form = standIn.tokenRequests[0]?.form
    expect(form?.get('code_verifier')).toBe(checks.codeVerifier)
    expect(form?.get('code')).toBe('the-code')
    expect(form?.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(form?.get('client_secret')).toBe(CLIENT_SECRET)
  })

  it('repeats the configured redirect URI whatever host the callback was seen on', async () => {
    const { checks } = await startAttempt()
    const seenElsewhere = new URL(`https://other.example.net/anything?code=c&state=${checks.state}`)
    await provider.exchangeCallback(seenElsewhere, checks)
    expect(standIn.tokenRequests[0]?.form.get('redirect_uri')).toBe(REDIRECT_URI)
  })

  it('reads an email_verified sent as text, and treats a missing one as unverified', async () => {
    const { checks, callbackUrl } = await startAttempt()
    standIn.setIdTokenClaims({ nonce: checks.nonce, email_verified: 'true' })
    expect((await provider.exchangeCallback(callbackUrl, checks)).emailVerified).toBe(true)

    const second = await startAttempt()
    standIn.setIdTokenClaims({ nonce: second.checks.nonce, email_verified: undefined })
    expect((await provider.exchangeCallback(second.callbackUrl, second.checks)).emailVerified).toBe(
      false
    )
  })

  it('rejects a callback whose state is not the one sent', async () => {
    const { checks } = await startAttempt()
    await expect(
      provider.exchangeCallback(callbackUrlFor('another-state'), checks)
    ).rejects.toThrow()
  })

  it('rejects an ID token with another nonce', async () => {
    const { checks, callbackUrl } = await startAttempt()
    standIn.setIdTokenClaims({ nonce: 'a-nonce-from-another-attempt' })
    await expect(provider.exchangeCallback(callbackUrl, checks)).rejects.toThrow()
  })

  it.each([
    ['another audience', { aud: 'someone-elses-client' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['an expiry in the past', { exp: 1_000, iat: 900 }]
  ])('rejects an ID token with %s', async (_label, claims) => {
    const { checks, callbackUrl } = await startAttempt()
    standIn.setIdTokenClaims({ nonce: checks.nonce, ...claims })
    await expect(provider.exchangeCallback(callbackUrl, checks)).rejects.toThrow()
  })

  it('rejects an ID token signed with a key the issuer does not publish', async () => {
    const { checks, callbackUrl } = await startAttempt()
    standIn.setSigningKey(createSigningKeys().privateKey)
    await expect(provider.exchangeCallback(callbackUrl, checks)).rejects.toThrow()
  })

  it('rejects a response without an ID token', async () => {
    const { checks, callbackUrl } = await startAttempt()
    standIn.omitIdToken()
    await expect(provider.exchangeCallback(callbackUrl, checks)).rejects.toThrow()
  })

  it('rejects a callback that carries an error from the provider', async () => {
    const { checks } = await startAttempt()
    await expect(
      provider.exchangeCallback(
        new URL(`${REDIRECT_URI}?error=access_denied&state=${checks.state}`),
        checks
      )
    ).rejects.toThrow()
  })
})
