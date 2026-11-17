import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createOAuthStore, createAccountStore } from '@designo/auth'
import { OAuthClientInformationFullSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  REDIRECT_URI,
  approveInBrowser,
  authorizationUrl,
  createBrowser,
  createPkcePair,
  postForm,
  registerClient,
  registerClientRaw,
  startOAuthServer,
  startServerWithoutSignIn,
  type OAuthServer
} from './oauthTestSupport.ts'

let app: OAuthServer

beforeEach(async () => {
  app = await startOAuthServer()
})

afterEach(async () => {
  await app.close()
})

const SIXTY_SECONDS = 60_000
const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000

const parseJson = async (response: Response): Promise<Record<string, unknown>> =>
  z.record(z.string(), z.unknown()).parse(await response.json())

const store = () => createOAuthStore(app.dataDirectory, () => app.time.now)

/** Registers a client, signs `code` in and allows it, and returns what the agent holds then. */
const allowedAuthorization = async (
  code = 'admin',
  clientOverrides: Record<string, unknown> = {}
) => {
  const client = await registerClient(app.origin, clientOverrides)
  const pkce = createPkcePair()
  const browser = createBrowser(app.origin)
  const redirect = await approveInBrowser(
    browser,
    app.origin,
    authorizationUrl(app.origin, {
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: pkce.challenge
    }),
    code
  )
  return { client, pkce, browser, redirect, code: redirect.searchParams.get('code') ?? '' }
}

const tokenRequest = (fields: Record<string, string | undefined>) =>
  postForm(app.origin, '/token', fields)

const exchange = (
  auth: Awaited<ReturnType<typeof allowedAuthorization>>,
  overrides: Record<string, string | undefined> = {}
) =>
  tokenRequest({
    grant_type: 'authorization_code',
    code: auth.code,
    client_id: auth.client.client_id,
    redirect_uri: REDIRECT_URI,
    code_verifier: auth.pkce.verifier,
    resource: `${app.origin}/mcp`,
    ...overrides
  })

describe('discovery', () => {
  it('describes the protected resource, at both well-known addresses', async () => {
    const expected = {
      resource: `${app.origin}/mcp`,
      authorization_servers: [app.origin],
      bearer_methods_supported: ['header'],
      resource_name: 'Designo'
    }
    const plain = await fetch(`${app.origin}/.well-known/oauth-protected-resource`)
    const withPath = await fetch(`${app.origin}/.well-known/oauth-protected-resource/mcp`)
    expect(await plain.json()).toEqual(expected)
    expect(await withPath.json()).toEqual(expected)
  })

  it('describes the authorization server: public clients, PKCE S256 only', async () => {
    const response = await fetch(`${app.origin}/.well-known/oauth-authorization-server`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      issuer: app.origin,
      authorization_endpoint: `${app.origin}/authorize`,
      token_endpoint: `${app.origin}/token`,
      registration_endpoint: `${app.origin}/register`,
      revocation_endpoint: `${app.origin}/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true
    })
  })

  it('takes the issuer from the public URL, never from the Host header', async () => {
    const response = await fetch(`${app.origin}/.well-known/oauth-authorization-server`, {
      headers: { 'X-Forwarded-Host': 'evil.example.com' }
    })
    const body = await parseJson(response)
    expect(JSON.stringify(body)).not.toContain('evil.example.com')
    expect(body.issuer).toBe(app.origin)
  })

  it('answers GET only', async () => {
    const response = await fetch(`${app.origin}/.well-known/oauth-authorization-server`, {
      method: 'POST'
    })
    expect(response.status).toBe(405)
  })
})

describe('cross-origin access', () => {
  it.each([
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-authorization-server',
    '/register',
    '/token',
    '/revoke',
    '/mcp'
  ])('lets any page call %s: it answers to a token, never to a cookie', async (route) => {
    const preflight = await fetch(`${app.origin}${route}`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://inspector.example.com', 'Access-Control-Request-Method': 'POST' }
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization')
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull()
    const answer = await fetch(`${app.origin}${route}`, {
      headers: { Origin: 'https://inspector.example.com' }
    })
    expect(answer.headers.get('access-control-allow-origin')).toBe('*')
  })

  it.each(['/authorize', '/api/me', '/api/files', '/api/connections', '/auth/google'])(
    'sends no CORS headers from %s, which trust the cookie',
    async (route) => {
      const response = await fetch(`${app.origin}${route}`, {
        redirect: 'manual',
        headers: { Origin: 'https://evil.example.com' }
      })
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
      const preflight = await fetch(`${app.origin}${route}`, {
        method: 'OPTIONS',
        redirect: 'manual',
        headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' }
      })
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
    }
  )
})

describe('registration', () => {
  const valid = { client_name: 'Claude Code', redirect_uris: [REDIRECT_URI] }

  it('registers a public client and answers with what RFC 7591 describes', async () => {
    const response = await registerClientRaw(app.origin, {
      ...valid,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await parseJson(response)
    expect(OAuthClientInformationFullSchema.safeParse(body).success).toBe(true)
    expect(body).toMatchObject({
      client_name: 'Claude Code',
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    })
    expect(body.client_secret).toBeUndefined()
    expect(await store().findClient(String(body.client_id))).toMatchObject({
      clientName: 'Claude Code'
    })
  })

  it.each([
    ['https', 'https://agent.example.com/callback'],
    ['http on localhost', 'http://localhost:6274/oauth/callback'],
    ['http on an IPv6 loopback address', 'http://[::1]:6274/callback']
  ])('accepts a %s redirect URI', async (_label, uri) => {
    const response = await registerClientRaw(app.origin, { ...valid, redirect_uris: [uri] })
    expect(response.status).toBe(201)
  })

  it.each([
    ['http on a real host', ['http://agent.example.com/callback']],
    ['a wildcard', ['https://*.example.com/callback']],
    ['a fragment', ['https://agent.example.com/callback#x']],
    ['a custom scheme', ['agent://callback']],
    ['a javascript URL', ['javascript:alert(1)']],
    ['one bad URI among good ones', [REDIRECT_URI, 'http://evil.example.com/cb']],
    ['too many URIs', Array.from({ length: 6 }, (_, index) => `https://a.example.com/${index}`)],
    ['a URI that is far too long', [`https://a.example.com/${'a'.repeat(600)}`]],
    ['no URIs', []]
  ])('refuses %s with invalid_redirect_uri', async (_label, redirect_uris) => {
    const response = await registerClientRaw(app.origin, { ...valid, redirect_uris })
    expect(response.status).toBe(400)
    expect((await parseJson(response)).error).toBe('invalid_redirect_uri')
  })

  it.each([
    ['a client that wants a secret', { token_endpoint_auth_method: 'client_secret_basic' }],
    ['a grant this server does not have', { grant_types: ['authorization_code', 'password'] }],
    ['no authorization_code grant', { grant_types: ['refresh_token'] }],
    ['an implicit response type', { response_types: ['token'] }]
  ])('refuses %s with invalid_client_metadata', async (_label, extra) => {
    const response = await registerClientRaw(app.origin, { ...valid, ...extra })
    expect(response.status).toBe(400)
    expect((await parseJson(response)).error).toBe('invalid_client_metadata')
  })

  it('refuses a body that is not JSON, and no redirect_uris at all', async () => {
    const notJson = await fetch(`${app.origin}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope'
    })
    expect(notJson.status).toBe(400)
    const missing = await registerClientRaw(app.origin, { client_name: 'No URIs' })
    expect(missing.status).toBe(400)
    const wrongType = await fetch(`${app.origin}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(valid)
    })
    expect(wrongType.status).toBe(400)
  })

  it('refuses a body over the size limit', async () => {
    const response = await registerClientRaw(app.origin, {
      ...valid,
      client_name: 'x'.repeat(40_000)
    })
    expect(response.status).toBe(413)
  })

  it('cleans the client name down to plain text of a sensible length, never markup-free by trust', async () => {
    const body = await parseJson(
      await registerClientRaw(app.origin, {
        ...valid,
        client_name: `  Evil\u0000\n‮ Agent ${'x'.repeat(300)}`
      })
    )
    const name = String(body.client_name)
    expect(name.length).toBeLessThanOrEqual(100)
    expect(name).toMatch(/^Evil Agent x+$/)
  })

  it('names an unnamed client, and keeps nothing it was not asked to keep', async () => {
    const body = await parseJson(
      await registerClientRaw(app.origin, {
        redirect_uris: [REDIRECT_URI],
        logo_uri: 'https://evil.example.com/logo.png',
        client_uri: 'https://evil.example.com'
      })
    )
    expect(body.client_name).toBe('An unnamed application')
    expect(JSON.stringify(body)).not.toContain('evil.example.com')
    expect(await readFile(path.join(app.dataDirectory, 'oauth.json'), 'utf8')).not.toContain(
      'evil.example.com'
    )
  })

  it('limits how fast one address may register, so the store cannot be filled', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 35 }, () => registerClientRaw(app.origin, valid).then((r) => r.status))
    )
    expect(statuses.filter((status) => status === 201)).toHaveLength(30)
    const refused = await registerClientRaw(app.origin, valid)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBeTruthy()
    expect((await parseJson(refused)).error).toBe('temporarily_unavailable')
  })
})

describe('authorize: requests that cannot be answered by redirecting', () => {
  it('shows an error page, not a redirect, for an unknown client', async () => {
    const browser = createBrowser(app.origin)
    await browser.signInAs('admin')
    const { response, url, body } = await browser.navigate(
      authorizationUrl(app.origin, { client_id: 'nobody', redirect_uri: REDIRECT_URI })
    )
    expect(response.status).toBe(400)
    expect(url.origin).toBe(app.origin)
    expect(body).toContain('not registered')
  })

  it.each([
    ['another port', 'http://127.0.0.1:33418/callback'],
    ['another path', 'http://127.0.0.1:33417/callback/extra'],
    ['another host', 'https://evil.example.com/callback'],
    ['a trailing slash', 'http://127.0.0.1:33417/callback/'],
    ['a prefix of the registered one', 'http://127.0.0.1:33417/call']
  ])('shows an error page, not a redirect, for %s as redirect_uri', async (_label, redirectUri) => {
    const client = await registerClient(app.origin)
    const browser = createBrowser(app.origin)
    await browser.signInAs('admin')
    const { response, url } = await browser.navigate(
      authorizationUrl(app.origin, {
        client_id: client.client_id,
        redirect_uri: redirectUri,
        code_challenge: createPkcePair().challenge
      })
    )
    expect(response.status).toBe(400)
    expect(url.origin).toBe(app.origin)
  })

  it('does not even start a sign-in for a request it would have to refuse', async () => {
    const response = await fetch(
      authorizationUrl(app.origin, { client_id: 'nobody', redirect_uri: REDIRECT_URI }),
      { redirect: 'manual' }
    )
    expect(response.status).toBe(400)
  })

  it('refuses a repeated client_id or redirect_uri as ambiguous', async () => {
    const client = await registerClient(app.origin)
    const pkce = createPkcePair()
    const url = `${authorizationUrl(app.origin, {
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: pkce.challenge
    })}&redirect_uri=${encodeURIComponent('https://evil.example.com/')}`
    const response = await fetch(url, { redirect: 'manual' })
    expect(response.status).toBe(400)
  })
})

describe('authorize: requests answered by redirecting back with an error', () => {
  const redirectedError = async (overrides: Record<string, string | undefined>) => {
    const client = await registerClient(app.origin)
    const response = await fetch(
      authorizationUrl(app.origin, {
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: createPkcePair().challenge,
        ...overrides
      }),
      { redirect: 'manual' }
    )
    const location = new URL(response.headers.get('location') ?? '/', app.origin)
    return { response, location }
  }

  it.each([
    ['no code_challenge', { code_challenge: undefined }, 'invalid_request'],
    ['no code_challenge_method', { code_challenge_method: undefined }, 'invalid_request'],
    ['the plain method', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['a challenge of the wrong shape', { code_challenge: 'short' }, 'invalid_request'],
    ['a response_type of token', { response_type: 'token' }, 'unsupported_response_type'],
    ['another resource', { resource: 'https://evil.example.com/mcp' }, 'invalid_target'],
    ['a resource that is another path here', { resource: '/mcp' }, 'invalid_target'],
    ['an oversized state', { state: 'x'.repeat(600) }, 'invalid_request']
  ])('answers %s with %s, to the redirect address', async (_label, overrides, error) => {
    const { response, location } = await redirectedError(overrides)
    expect(response.status).toBe(302)
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI)
    expect(location.searchParams.get('error')).toBe(error)
    expect(location.searchParams.get('code')).toBeNull()
    expect(location.searchParams.get('iss')).toBe(app.origin)
  })

  it('echoes the state back with the error', async () => {
    const { location } = await redirectedError({ code_challenge_method: 'plain', state: 'abc 123' })
    expect(location.searchParams.get('state')).toBe('abc 123')
  })

  it('accepts a request with no resource: the token is for this server either way', async () => {
    const { response } = await redirectedError({ resource: undefined })
    expect(response.headers.get('location')).toMatch(/^\/auth\/google\?return_to=/)
  })
})

describe('authorize: signing in and consent', () => {
  it('sends someone who is signed out through Google and back to the same request', async () => {
    const client = await registerClient(app.origin)
    const url = authorizationUrl(app.origin, {
      client_id: client.client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: createPkcePair().challenge
    })
    const browser = createBrowser(app.origin)
    const first = await browser.send(url)
    expect(first.status).toBe(302)
    const toSignIn = first.headers.get('location') ?? ''
    expect(toSignIn.startsWith('/auth/google?return_to=')).toBe(true)
    const returnTo = new URL(toSignIn, app.origin).searchParams.get('return_to')
    expect(returnTo).toBe(`${new URL(url).pathname}${new URL(url).search}`)
    const atGoogle = await browser.navigate(toSignIn)
    expect(atGoogle.url.hostname).toBe('accounts.example.com')
    const back = await browser.completeGoogleSignIn(atGoogle.url, 'admin')
    expect(back.response.status).toBe(200)
    expect(back.url.pathname).toBe('/authorize')
    expect(back.body).toContain('wants to edit your Designo designs')
  })

  it('shows the consent page to a signed-in account, with the headers that stop framing', async () => {
    const client = await registerClient(app.origin, { client_name: 'Claude Code' })
    const browser = createBrowser(app.origin)
    await browser.signInAs('admin')
    const { response, body } = await browser.navigate(
      authorizationUrl(app.origin, {
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: createPkcePair().challenge
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-inline')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(body).toContain('<strong>Claude Code</strong> wants to edit your Designo designs')
    expect(body).toContain('Ada')
    expect(body).toContain('http://127.0.0.1:33417')
    expect(body).toMatch(/<button[^>]*value="allow"[^>]*>Allow<\/button>/)
    expect(body).toMatch(/<button[^>]*value="deny"[^>]*>Deny<\/button>/)
    expect(body).not.toContain('<script')
  })

  it('escapes the client name, so a name written as markup is shown as text', async () => {
    const client = await registerClient(app.origin, {
      client_name: '<img src=x onerror=alert(1)>"\'&'
    })
    const browser = createBrowser(app.origin)
    await browser.signInAs('admin')
    const { body } = await browser.navigate(
      authorizationUrl(app.origin, {
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: createPkcePair().challenge
      })
    )
    expect(body).not.toContain('<img')
    expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;')
  })

  it.each([
    ['a stranger waiting for approval', 'stranger', 'Waiting for approval'],
    ['an account that is blocked', 'friend', 'blocked']
  ])('refuses %s with no consent and no code', async (_label, code, expected) => {
    const browser = createBrowser(app.origin)
    await browser.signInAs(code)
    if (code === 'friend') {
      await createAccountStore(app.dataDirectory).setStatus(
        (await createAccountStore(app.dataDirectory).findByEmail('friend@team.example.com'))[0]
          ?.id ?? '',
        'blocked'
      )
    }
    const client = await registerClient(app.origin)
    const { response, body } = await browser.navigate(
      authorizationUrl(app.origin, {
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: createPkcePair().challenge
      })
    )
    expect(response.status).toBe(403)
    expect(body).toContain(expected)
    expect(body).not.toContain('value="allow"')
  })
})

describe('authorize: the decision', () => {
  const consentFor = async (code = 'admin') => {
    // Two registered addresses, so a change of address is caught by the token, not by the
    // exact-match rule that would catch an unregistered one first.
    const client = await registerClient(app.origin, {
      redirect_uris: [REDIRECT_URI, 'http://127.0.0.1:44444/other']
    })
    const pkce = createPkcePair()
    const browser = createBrowser(app.origin)
    await browser.signInAs(code)
    const consent = await browser.navigate(
      authorizationUrl(app.origin, {
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        code_challenge: pkce.challenge
      })
    )
    return { client, pkce, browser, fields: readFields(consent.body) }
  }

  const readFields = (html: string): Record<string, string> =>
    Object.fromEntries(
      [...html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)].map(
        ([, name = '', value = '']) => [name, value.replaceAll('&amp;', '&')]
      )
    )

  const decide = (
    browser: ReturnType<typeof createBrowser>,
    fields: Record<string, string | undefined>,
    headers: Record<string, string> = { Origin: app.origin }
  ) =>
    browser.send(`${app.origin}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(
        Object.entries(fields).flatMap(([name, value]) =>
          value === undefined ? [] : [[name, value]]
        )
      ).toString()
    })

  it('sends an allowed request back with a code, the state and the issuer', async () => {
    const { browser, fields } = await consentFor()
    const response = await decide(browser, { ...fields, decision: 'allow' })
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('location') ?? '')
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI)
    expect(location.searchParams.get('code')).toMatch(/^[\w-]{43}$/)
    expect(location.searchParams.get('state')).toBe('state-from-client')
    expect(location.searchParams.get('iss')).toBe(app.origin)
  })

  it('sends a denied request back with access_denied and no code', async () => {
    const { browser, fields } = await consentFor()
    const response = await decide(browser, { ...fields, decision: 'deny' })
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.searchParams.get('error')).toBe('access_denied')
    expect(location.searchParams.get('state')).toBe('state-from-client')
    expect(location.searchParams.get('code')).toBeNull()
  })

  it('treats anything but allow as no', async () => {
    const { browser, fields } = await consentFor()
    const response = await decide(browser, { ...fields, decision: 'maybe' })
    const location = new URL(response.headers.get('location') ?? app.origin)
    expect(location.searchParams.get('code')).toBeNull()
    expect(location.searchParams.get('error')).toBe('access_denied')
  })

  it.each([
    ['no CSRF token', { consent_token: undefined }],
    ['an empty CSRF token', { consent_token: '' }],
    ['a made-up CSRF token', { consent_token: 'forged.token' }]
  ])('refuses a decision with %s, and issues no code', async (_label, change) => {
    const { browser, fields } = await consentFor()
    const response = await decide(browser, { ...fields, ...change, decision: 'allow' })
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
  })

  it('refuses a token made for another account', async () => {
    const mine = await consentFor('admin')
    const theirs = await consentFor('friend')
    const response = await decide(mine.browser, {
      ...mine.fields,
      consent_token: theirs.fields.consent_token,
      decision: 'allow'
    })
    expect(response.status).toBe(403)
  })

  it.each([
    ['the redirect address', { redirect_uri: 'http://127.0.0.1:44444/other' }],
    ['the code challenge', { code_challenge: createPkcePair().challenge }],
    ['the state', { state: 'another-state' }]
  ])('refuses a decision where %s was changed after the page was shown', async (_label, change) => {
    const { browser, fields } = await consentFor()
    const response = await decide(browser, { ...fields, ...change, decision: 'allow' })
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
  })

  it('refuses a decision from another site, even with a valid token', async () => {
    const { browser, fields } = await consentFor()
    const response = await decide(
      browser,
      { ...fields, decision: 'allow' },
      { Origin: 'https://evil.example.com' }
    )
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
  })

  it('refuses a decision with no session at all', async () => {
    const { fields } = await consentFor()
    const response = await decide(createBrowser(app.origin), { ...fields, decision: 'allow' })
    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
  })

  it('refuses a page that has stood open for more than ten minutes', async () => {
    const { browser, fields } = await consentFor()
    app.time.now += 10 * 60 * 1000
    const sessionStillGood = await browser.send(`${app.origin}/api/me`)
    expect(sessionStillGood.status).toBe(200)
    const response = await decide(browser, { ...fields, decision: 'allow' })
    expect(response.status).toBe(403)
  })

  it('refuses a decision from an account that was blocked while the page was open', async () => {
    const { browser, fields } = await consentFor('friend')
    const accounts = createAccountStore(app.dataDirectory)
    const [friend] = await accounts.findByEmail('friend@team.example.com')
    await accounts.setStatus(friend?.id ?? '', 'blocked')
    const response = await decide(browser, { ...fields, decision: 'allow' })
    expect(response.status).toBe(403)
    expect(response.headers.get('location')).toBeNull()
  })

  it('refuses a decision sent as JSON', async () => {
    const { browser, fields } = await consentFor()
    const response = await browser.send(`${app.origin}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: app.origin },
      body: JSON.stringify({ ...fields, decision: 'allow' })
    })
    expect(response.status).toBe(415)
  })

  it('answers other methods with 405', async () => {
    const response = await fetch(`${app.origin}/authorize`, { method: 'DELETE' })
    expect(response.status).toBe(405)
  })
})

describe('sign-in return location', () => {
  const signInReturning = async (returnTo: string): Promise<string | null> => {
    const browser = createBrowser(app.origin)
    const start = await browser.send(
      `${app.origin}/auth/google?return_to=${encodeURIComponent(returnTo)}`
    )
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('attempt')
    const callback = await browser.send(
      `${app.origin}/auth/google/callback?code=admin&state=state-${state}`
    )
    return callback.headers.get('location')
  }

  it('goes back to a path on this site', async () => {
    expect(await signInReturning('/authorize?client_id=abc&state=x')).toBe(
      '/authorize?client_id=abc&state=x'
    )
  })

  it('goes home when nothing is asked for', async () => {
    const browser = createBrowser(app.origin)
    const start = await browser.send(`${app.origin}/auth/google`)
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('attempt')
    const callback = await browser.send(
      `${app.origin}/auth/google/callback?code=admin&state=state-${state}`
    )
    expect(callback.headers.get('location')).toBe('/')
  })

  it.each([
    'https://evil.example.com/',
    '//evil.example.com/',
    '/\\evil.example.com',
    '/\t/evil.example.com',
    '/.//evil.example.com',
    'javascript:alert(1)',
    'authorize',
    `/${'a'.repeat(3000)}`
  ])('never redirects to %j, whatever the link says', async (returnTo) => {
    expect(await signInReturning(returnTo)).toBe('/')
  })

  it('cannot be redirected by editing the cookie: the return location is inside the signature', async () => {
    const browser = createBrowser(app.origin)
    const start = await browser.send(`${app.origin}/auth/google?return_to=%2Fauthorize`)
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('attempt')
    const cookie = browser.cookieHeader()
    const [body = '', signature = ''] = (cookie.split('designo_login=')[1] ?? '').split('.')
    const forged = Buffer.from(
      Buffer.from(body, 'base64url').toString().replace('/authorize', '//evil.example.com'),
      'utf8'
    ).toString('base64url')
    const response = await fetch(
      `${app.origin}/auth/google/callback?code=admin&state=state-${state}`,
      { redirect: 'manual', headers: { Cookie: `designo_login=${forged}.${signature}` } }
    )
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
  })
})

describe('token: authorization code', () => {
  it('trades a code for an access token and a refresh token that no cache may keep', async () => {
    const auth = await allowedAuthorization()
    const response = await exchange(auth)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('pragma')).toBe('no-cache')
    const body = await parseJson(response)
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 3600 })
    expect(String(body.access_token)).toMatch(/^[\w-]{43}$/)
    expect(String(body.refresh_token)).toMatch(/^[\w-]{43}$/)
    expect(body.access_token).not.toBe(body.refresh_token)
    expect(await store().authenticateAccessToken(String(body.access_token))).toBeDefined()
  })

  it('accepts the exchange without a resource, and with the right one', async () => {
    const without = await exchange(await allowedAuthorization(), { resource: undefined })
    expect(without.status).toBe(200)
  })

  it('refuses a wrong code_verifier, and the code is then spent', async () => {
    const auth = await allowedAuthorization()
    const wrong = await exchange(auth, { code_verifier: createPkcePair().verifier })
    expect(wrong.status).toBe(400)
    expect((await parseJson(wrong)).error).toBe('invalid_grant')
    const right = await exchange(auth)
    expect((await parseJson(right)).error).toBe('invalid_grant')
  })

  it('refuses the challenge itself as a verifier, which is what the plain method would accept', async () => {
    const auth = await allowedAuthorization()
    const response = await exchange(auth, { code_verifier: auth.pkce.challenge })
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses a request with no code_verifier, without spending the code', async () => {
    const auth = await allowedAuthorization()
    const missing = await exchange(auth, { code_verifier: undefined })
    expect((await parseJson(missing)).error).toBe('invalid_request')
    expect((await exchange(auth)).status).toBe(200)
  })

  it('refuses a code used twice, and revokes what the first use produced', async () => {
    const auth = await allowedAuthorization()
    const first = await exchange(auth)
    const firstTokens = await parseJson(first)
    expect(await store().authenticateAccessToken(String(firstTokens.access_token))).toBeDefined()
    const replay = await exchange(auth)
    expect(replay.status).toBe(400)
    expect((await parseJson(replay)).error).toBe('invalid_grant')
    expect(await store().authenticateAccessToken(String(firstTokens.access_token))).toBeUndefined()
  })

  it('refuses a code presented by another client', async () => {
    const auth = await allowedAuthorization()
    const other = await registerClient(app.origin, { client_name: 'Another agent' })
    const response = await exchange(auth, { client_id: other.client_id })
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses a code presented with another redirect_uri, even a registered one', async () => {
    const auth = await allowedAuthorization('admin', {
      redirect_uris: [REDIRECT_URI, 'http://127.0.0.1:44444/other']
    })
    const response = await exchange(auth, { redirect_uri: 'http://127.0.0.1:44444/other' })
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses a code presented with no redirect_uri', async () => {
    const auth = await allowedAuthorization()
    const response = await exchange(auth, { redirect_uri: undefined })
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses an unknown client_id and a missing one', async () => {
    const auth = await allowedAuthorization()
    expect((await parseJson(await exchange(auth, { client_id: 'nobody' }))).error).toBe(
      'invalid_client'
    )
    expect((await parseJson(await exchange(auth, { client_id: undefined }))).error).toBe(
      'invalid_client'
    )
  })

  it('refuses a made-up code', async () => {
    const auth = await allowedAuthorization()
    const response = await exchange(auth, { code: 'a'.repeat(43) })
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses a resource that is not this server', async () => {
    const auth = await allowedAuthorization()
    const response = await exchange(auth, { resource: 'https://evil.example.com/mcp' })
    expect((await parseJson(response)).error).toBe('invalid_target')
  })

  it('refuses a code after sixty seconds', async () => {
    const auth = await allowedAuthorization()
    app.time.now += SIXTY_SECONDS
    const response = await exchange(auth)
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses to make tokens for an account that was blocked after it said yes', async () => {
    const auth = await allowedAuthorization('friend')
    const accounts = createAccountStore(app.dataDirectory)
    const [friend] = await accounts.findByEmail('friend@team.example.com')
    await accounts.setStatus(friend?.id ?? '', 'blocked')
    const response = await exchange(auth)
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it.each(['password', 'client_credentials', 'implicit', ''])(
    'refuses the %j grant type',
    async (grantType) => {
      const response = await tokenRequest({ grant_type: grantType })
      expect(response.status).toBe(400)
      expect((await parseJson(response)).error).toBe('unsupported_grant_type')
    }
  )

  it('answers GET with 405 and a body that is not a form with 415', async () => {
    expect((await fetch(`${app.origin}/token`)).status).toBe(405)
    const json = await fetch(`${app.origin}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    expect(json.status).toBe(415)
  })

  it('limits how fast one address may ask for tokens', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 130 }, () =>
        tokenRequest({ grant_type: 'password' }).then((response) => response.status)
      )
    )
    expect(statuses.filter((status) => status === 429).length).toBe(10)
  })
})

describe('token: refresh', () => {
  const refreshing = async () => {
    const auth = await allowedAuthorization()
    const tokens = await parseJson(await exchange(auth))
    return { auth, tokens, refresh: String(tokens.refresh_token) }
  }

  const refreshRequest = (
    auth: Awaited<ReturnType<typeof allowedAuthorization>>,
    refreshToken: string,
    overrides: Record<string, string | undefined> = {}
  ) =>
    tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: auth.client.client_id,
      ...overrides
    })

  it('trades a refresh token for a new pair and retires the old one', async () => {
    const { auth, tokens, refresh } = await refreshing()
    const response = await refreshRequest(auth, refresh)
    expect(response.status).toBe(200)
    const next = await parseJson(response)
    expect(next.access_token).not.toBe(tokens.access_token)
    expect(next.refresh_token).not.toBe(refresh)
    expect(await store().authenticateAccessToken(String(tokens.access_token))).toBeUndefined()
    expect(await store().authenticateAccessToken(String(next.access_token))).toBeDefined()
  })

  it('revokes the whole grant when a refresh token that was already used comes back', async () => {
    const { auth, refresh } = await refreshing()
    const next = await parseJson(await refreshRequest(auth, refresh))
    // Just after the trade the same answer is given again, for a client that asked twice at once.
    app.time.now += 30_000
    const reuse = await refreshRequest(auth, refresh)
    expect(reuse.status).toBe(400)
    expect((await parseJson(reuse)).error).toBe('invalid_grant')
    expect(await store().authenticateAccessToken(String(next.access_token))).toBeUndefined()
    const afterwards = await refreshRequest(auth, String(next.refresh_token))
    expect((await parseJson(afterwards)).error).toBe('invalid_grant')
  })

  it('answers a refresh token asked for twice at once with the same new pair', async () => {
    const { auth, refresh } = await refreshing()
    const [first, second] = await Promise.all([
      refreshRequest(auth, refresh).then(parseJson),
      refreshRequest(auth, refresh).then(parseJson)
    ])
    expect(second).toEqual(first)
    expect(await store().authenticateAccessToken(String(first.access_token))).toBeDefined()
  })

  it('refuses a refresh token from another client', async () => {
    const { refresh } = await refreshing()
    const other = await registerClient(app.origin, { client_name: 'Another agent' })
    const response = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: other.client_id
    })
    expect((await parseJson(response)).error).toBe('invalid_grant')
  })

  it('refuses an expired refresh token after thirty days', async () => {
    const { auth, refresh } = await refreshing()
    app.time.now += THIRTY_ONE_DAYS
    expect((await parseJson(await refreshRequest(auth, refresh))).error).toBe('invalid_grant')
  })

  it('refuses an access token in place of a refresh token, and no token at all', async () => {
    const { auth, tokens } = await refreshing()
    expect((await parseJson(await refreshRequest(auth, String(tokens.access_token)))).error).toBe(
      'invalid_grant'
    )
    expect(
      (await parseJson(await refreshRequest(auth, 'x', { refresh_token: undefined }))).error
    ).toBe('invalid_request')
  })

  it('refuses while the account is blocked, without using the refresh token up', async () => {
    const auth = await allowedAuthorization('friend')
    const tokens = await parseJson(await exchange(auth))
    const refresh = String(tokens.refresh_token)
    const accounts = createAccountStore(app.dataDirectory)
    const [friend] = await accounts.findByEmail('friend@team.example.com')
    await accounts.setStatus(friend?.id ?? '', 'blocked')
    expect((await parseJson(await refreshRequest(auth, refresh))).error).toBe('invalid_grant')
    await accounts.setStatus(friend?.id ?? '', 'approved')
    expect((await refreshRequest(auth, refresh)).status).toBe(200)
  })
})

describe('revoke', () => {
  it('ends the grant a token belongs to, access or refresh', async () => {
    const auth = await allowedAuthorization()
    const tokens = await parseJson(await exchange(auth))
    const response = await postForm(app.origin, '/revoke', {
      token: String(tokens.refresh_token),
      client_id: auth.client.client_id
    })
    expect(response.status).toBe(200)
    expect(await store().authenticateAccessToken(String(tokens.access_token))).toBeUndefined()
  })

  it('says the same for a token it does not know', async () => {
    const response = await postForm(app.origin, '/revoke', { token: 'guess' })
    expect(response.status).toBe(200)
  })

  it('does nothing when another client names itself, and still says 200', async () => {
    const auth = await allowedAuthorization()
    const tokens = await parseJson(await exchange(auth))
    const other = await registerClient(app.origin, { client_name: 'Another agent' })
    const response = await postForm(app.origin, '/revoke', {
      token: String(tokens.access_token),
      client_id: other.client_id
    })
    expect(response.status).toBe(200)
    expect(await store().authenticateAccessToken(String(tokens.access_token))).toBeDefined()
  })

  it('needs a token, and POST', async () => {
    expect((await postForm(app.origin, '/revoke', {})).status).toBe(400)
    expect((await fetch(`${app.origin}/revoke`)).status).toBe(405)
  })
})

describe('what is on disk', () => {
  it('holds no token, no code and no verifier, only hashes', async () => {
    const auth = await allowedAuthorization()
    const tokens = await parseJson(await exchange(auth))
    const file = await readFile(path.join(app.dataDirectory, 'oauth.json'), 'utf8')
    ;[
      String(tokens.access_token),
      String(tokens.refresh_token),
      auth.code,
      auth.pkce.verifier
    ].forEach((secret) => {
      expect(file).not.toContain(secret)
    })
    expect(file).toMatch(/[\da-f]{64}/)
  })
})

describe('with sign-in off', () => {
  it('has none of these routes: they fall through to the static editor', async () => {
    const off = await startServerWithoutSignIn()
    try {
      const routes = [
        '/mcp',
        '/register',
        '/authorize',
        '/token',
        '/revoke',
        '/.well-known/oauth-authorization-server',
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
        '/api/connections'
      ]
      const answers = await Promise.all(
        routes.map(async (route) => {
          const response = await fetch(`${off.origin}${route}`, { method: 'POST', body: '{}' })
          return [
            route,
            response.status,
            await response.text(),
            response.headers.get('access-control-allow-origin')
          ]
        })
      )
      answers.forEach(([route, status, body, cors]) => {
        expect([route, status, body, cors]).toEqual([route, 200, 'static editor', null])
      })
    } finally {
      await off.close()
    }
  })
})
