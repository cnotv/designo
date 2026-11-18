import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AuthSettings, VerifiedIdentity } from '@designo/auth'
import type { Rasterize } from '@designo/mcp'
import { createFakeIdentityProvider } from '@designo/auth/testing'
import { z } from 'zod'
import { createProductionServer } from './createProductionServer.ts'

export const SESSION_SECRET = 'a-session-secret-that-is-long-enough-1234'
export const START_TIME = 1_700_000_000_000

export const identities: Record<string, VerifiedIdentity> = {
  admin: { subject: 'sub-admin', email: 'admin@example.com', emailVerified: true, name: 'Ada' },
  friend: {
    subject: 'sub-friend',
    email: 'friend@team.example.com',
    emailVerified: true,
    name: 'Fay'
  },
  stranger: {
    subject: 'sub-stranger',
    email: 'stranger@example.com',
    emailVerified: true,
    name: 'Sam'
  }
}

export interface OAuthServer {
  server: Server
  /** The public URL: what agents connect to and the issuer of its tokens. */
  origin: string
  dataDirectory: string
  time: { now: number }
  close: () => Promise<void>
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })

/**
 * Starts the production server with sign-in on and the fake identity provider, on a port chosen
 * first so the public URL, which is the issuer, names the address clients really connect to.
 * @param overrides - Settings to change from the defaults.
 * @param rasterize - Replaces the screenshot renderer, to force a crash or a timeout.
 * @returns The running server and what a test needs to drive and clean it up.
 */
export const startOAuthServer = async (
  overrides: Partial<AuthSettings> = {},
  rasterize?: Rasterize
): Promise<OAuthServer> => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-oauth-server-'))
  const port = await freePort()
  const origin = `http://localhost:${port}`
  const time = { now: START_TIME }
  const server = createProductionServer({
    dataDirectory,
    serveStatic: (_request, response) => {
      response.end('static editor')
    },
    clock: () => time.now,
    rasterize,
    settings: {
      googleClientId: 'client-id.example.com',
      googleClientSecret: 'google-client-secret-that-must-never-leak',
      publicUrl: origin,
      secureCookies: false,
      sessionSecret: SESSION_SECRET,
      adminEmails: ['admin@example.com'],
      autoApproveEmails: [],
      autoApproveDomains: ['team.example.com'],
      ...overrides
    },
    identityProvider: createFakeIdentityProvider(identities)
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return {
    server,
    origin,
    dataDirectory,
    time,
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await rm(dataDirectory, { recursive: true, force: true })
    }
  }
}

/**
 * Starts the production server with sign-in off.
 * @returns The running server.
 */
export const startServerWithoutSignIn = async (): Promise<OAuthServer> => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-oauth-server-'))
  const port = await freePort()
  const time = { now: START_TIME }
  const server = createProductionServer({
    dataDirectory,
    serveStatic: (_request, response) => {
      response.end('static editor')
    },
    clock: () => time.now
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  return {
    server,
    origin: `http://localhost:${port}`,
    dataDirectory,
    time,
    close: async () => {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await rm(dataDirectory, { recursive: true, force: true })
    }
  }
}

export interface PkcePair {
  verifier: string
  challenge: string
}

const PKCE_VERIFIER_BYTES = 32
const HTTP_CREATED = 201
const MAX_REDIRECT_HOPS = 10

/**
 * Makes a PKCE verifier and the S256 challenge an agent would send for it.
 * @returns The pair.
 */
export const createPkcePair = (): PkcePair => {
  const verifier = randomBytes(PKCE_VERIFIER_BYTES).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export interface Navigation {
  response: Response
  /** Where the browser ended up: the last URL it was sent to, followed or not. */
  url: URL
  body: string
}

const applySetCookie = (
  jar: ReadonlyMap<string, string>,
  headers: readonly string[]
): ReadonlyMap<string, string> =>
  headers.reduce((next, header) => {
    const [pair = '', ...attributes] = header.split(';').map((part) => part.trim())
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    const isCleared = attributes.some((attribute) => attribute.toLowerCase() === 'max-age=0')
    const others = [...next].filter(([otherName]) => otherName !== name)
    return new Map(isCleared ? others : [...others, [name, value]])
  }, jar)

export interface Browser {
  /** Sends one request with the cookies this browser holds, following nothing. */
  send: (url: string, init?: RequestInit) => Promise<Response>
  /** Follows redirects that stay on the Designo origin and stops at any other. */
  navigate: (url: string) => Promise<Navigation>
  /** Finishes a sign-in at the identity provider, as the person `code` stands for. */
  completeGoogleSignIn: (googleUrl: URL, code: string) => Promise<Navigation>
  signInAs: (code: string) => Promise<Navigation>
  cookieHeader: () => string
}

/**
 * A stand-in for a person's browser: it keeps cookies, follows redirects on the Designo origin
 * and stops at the identity provider, where the test says who signs in.
 * @param origin - The Designo origin.
 * @returns The browser.
 */
export const createBrowser = (origin: string): Browser => {
  let jar: ReadonlyMap<string, string> = new Map()
  const cookieHeader = (): string => [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
  const send: Browser['send'] = async (url, init = {}) => {
    const response = await fetch(url, {
      redirect: 'manual',
      ...init,
      headers: { ...init.headers, Cookie: cookieHeader() }
    })
    jar = applySetCookie(jar, response.headers.getSetCookie())
    return response
  }
  const navigate: Browser['navigate'] = async (start) => {
    const visit = async (url: URL, hops: number): Promise<Navigation> => {
      const response = await send(url.href)
      const location = response.headers.get('location')
      const next = location ? new URL(location, url) : undefined
      if (next && next.origin === origin && hops < MAX_REDIRECT_HOPS) {
        await response.arrayBuffer()
        return visit(next, hops + 1)
      }
      return { response, url: next ?? url, body: next ? '' : await response.text() }
    }
    return visit(new URL(start, origin), 0)
  }
  const completeGoogleSignIn: Browser['completeGoogleSignIn'] = (googleUrl, code) =>
    navigate(
      `/auth/google/callback?code=${code}&state=state-${googleUrl.searchParams.get('attempt')}`
    )
  return {
    send,
    navigate,
    completeGoogleSignIn,
    cookieHeader,
    signInAs: async (code) => {
      const atGoogle = await navigate('/auth/google')
      return completeGoogleSignIn(atGoogle.url, code)
    }
  }
}

const unescapeHtml = (text: string): string =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

/**
 * Reads the hidden fields of the consent form out of the page, as a browser would submit them.
 * @param html - The consent page.
 * @returns The field names and values.
 */
export const readConsentFields = (html: string): Record<string, string> =>
  Object.fromEntries(
    [...html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)].map(
      ([, name = '', value = '']) => [unescapeHtml(name), unescapeHtml(value)]
    )
  )

export interface AuthorizationQuery {
  client_id: string
  redirect_uri: string
  response_type: string
  code_challenge: string | undefined
  code_challenge_method: string | undefined
  state: string | undefined
  resource: string | undefined
}

/**
 * Builds the URL an agent opens in the browser to ask for access.
 * @param origin - The Designo origin.
 * @param query - The parameters to send; a valid request except for the ones left out.
 * @returns The URL.
 */
export const authorizationUrl = (
  origin: string,
  query: Partial<AuthorizationQuery> & Pick<AuthorizationQuery, 'client_id' | 'redirect_uri'>
): string => {
  const parameters: Record<string, string | undefined> = {
    response_type: 'code',
    code_challenge_method: 'S256',
    state: 'state-from-client',
    resource: `${origin}/mcp`,
    ...query
  }
  const search = new URLSearchParams(
    Object.entries(parameters).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value]]
    )
  )
  return `${origin}/authorize?${search.toString()}`
}

export const REDIRECT_URI = 'http://127.0.0.1:33417/callback'

/**
 * Registers a client the way an agent does.
 * @param origin - The Designo origin.
 * @param body - The registration request; a valid one when left out.
 * @returns The response.
 */
export const registerClientRaw = (origin: string, body: unknown): Promise<Response> =>
  fetch(`${origin}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

const registeredClientSchema = z.object({
  client_id: z.string(),
  redirect_uris: z.array(z.string()),
  client_name: z.string()
})

export type RegisteredClient = z.infer<typeof registeredClientSchema>

/**
 * Registers a client and returns what the server answers.
 * @param origin - The Designo origin.
 * @param overrides - Registration fields to change from a valid request.
 * @returns The registered client.
 */
export const registerClient = async (
  origin: string,
  overrides: Record<string, unknown> = {}
): Promise<RegisteredClient> => {
  const response = await registerClientRaw(origin, {
    client_name: 'Test Agent',
    redirect_uris: [REDIRECT_URI],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    ...overrides
  })
  if (response.status !== HTTP_CREATED) throw new Error(`Registration answered ${response.status}`)
  return registeredClientSchema.parse(await response.json())
}

/**
 * Posts a form, as an agent does to the token endpoint.
 * @param origin - The Designo origin.
 * @param route - The path to post to.
 * @param fields - The form fields; undefined ones are left out.
 * @param headers - Extra request headers.
 * @returns The response.
 */
export const postForm = (
  origin: string,
  route: string,
  fields: Record<string, string | undefined>,
  headers: Record<string, string> = {}
): Promise<Response> =>
  fetch(`${origin}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(
      Object.entries(fields).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, value]]
      )
    ).toString()
  })

/**
 * Signs a person in, shows them the consent page and answers it, as their browser would.
 * @param browser - The person's browser.
 * @param origin - The Designo origin.
 * @param authorizeUrl - The URL an agent opened.
 * @param code - Which fake identity signs in when the browser is signed out.
 * @param decision - What the person clicks.
 * @returns Where the browser is sent next, which is the agent's redirect address.
 */
export const approveInBrowser = async (
  browser: Browser,
  origin: string,
  authorizeUrl: string,
  code: string,
  decision: 'allow' | 'deny' = 'allow'
): Promise<URL> => {
  const first = await browser.navigate(authorizeUrl)
  const consent =
    first.url.hostname === 'accounts.example.com'
      ? await browser.completeGoogleSignIn(first.url, code)
      : first
  const fields = readConsentFields(consent.body)
  const answer = await browser.send(`${origin}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    body: new URLSearchParams({ ...fields, decision }).toString()
  })
  const location = answer.headers.get('location')
  if (!location) throw new Error(`The consent answered ${answer.status} with no redirect`)
  return new URL(location)
}

export interface AgentTokens {
  accessToken: string
  refreshToken: string
  clientId: string
  browser: Browser
}

const tokenResponseSchema = z.object({ access_token: z.string(), refresh_token: z.string() })

/**
 * Walks an agent through the whole sign-in as `code` stands for, with no MCP client: registers,
 * has the person sign in and allow it, and trades the code for tokens.
 * @param app - The running server.
 * @param code - Which fake identity signs in.
 * @param browser - The person's browser, so a test can reuse a session or keep it afterwards.
 * @returns The tokens and the browser.
 */
export const obtainAgentTokens = async (
  app: OAuthServer,
  code: string,
  browser: Browser = createBrowser(app.origin)
): Promise<AgentTokens> => {
  const client = await registerClient(app.origin)
  const pkce = createPkcePair()
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
  const response = await postForm(app.origin, '/token', {
    grant_type: 'authorization_code',
    code: redirect.searchParams.get('code') ?? '',
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    code_verifier: pkce.verifier
  })
  const tokens = tokenResponseSchema.parse(await response.json())
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    clientId: client.client_id,
    browser
  }
}
