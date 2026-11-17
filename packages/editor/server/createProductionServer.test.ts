import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { request as httpRequest, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  accountDirectory,
  createAccountStore,
  createSessionValue,
  type Account,
  type AuthSettings,
  type VerifiedIdentity
} from '@designo/auth'
import { createFakeIdentityProvider } from '@designo/auth/testing'
import { createDocument } from '@designo/core'
import { readDocument, writeDocument } from '@designo/storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProductionServer } from './createProductionServer.ts'

const CLIENT_SECRET = 'google-client-secret-that-must-never-leak'
const SESSION_SECRET = 'a-session-secret-that-is-long-enough-1234'
const OTHER_SECRET = 'a-different-secret-that-is-also-long-5678'
const START_TIME = 1_700_000_000_000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

const identities: Record<string, VerifiedIdentity> = {
  admin: { subject: 'sub-admin', email: 'admin@example.com', emailVerified: true, name: 'Ada' },
  stranger: {
    subject: 'sub-stranger',
    email: 'stranger@example.com',
    emailVerified: true,
    name: 'Sam'
  },
  friend: {
    subject: 'sub-friend',
    email: 'friend@team.example.com',
    emailVerified: true,
    name: 'Fay'
  },
  fake: {
    subject: 'sub-fake',
    email: 'admin@example.com',
    emailVerified: false,
    name: 'Not Ada'
  },
  fakeFriend: {
    subject: 'sub-fake-friend',
    email: 'someone@team.example.com',
    emailVerified: false,
    name: 'Not Fay'
  }
}

const makeSettings = (overrides: Partial<AuthSettings> = {}): AuthSettings => ({
  googleClientId: 'client-id.example.com',
  googleClientSecret: CLIENT_SECRET,
  publicUrl: 'http://localhost:5320',
  secureCookies: false,
  sessionSecret: SESSION_SECRET,
  adminEmails: ['admin@example.com'],
  autoApproveEmails: [],
  autoApproveDomains: ['team.example.com'],
  ...overrides
})

interface Harness {
  server: Server
  baseUrl: string
  dataDirectory: string
  time: { now: number }
}

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
}

const staticStub = (_request: unknown, response: { end: (body: string) => void }): void => {
  response.end('static editor')
}

let dataDirectory: string
let harness: Harness
const openServers: Server[] = []

const startHarness = async (
  settings: AuthSettings | 'sign-in-off' = makeSettings()
): Promise<Harness> => {
  const time = { now: START_TIME }
  const base = { dataDirectory, serveStatic: staticStub, clock: () => time.now }
  const server = createProductionServer(
    settings === 'sign-in-off'
      ? base
      : { ...base, settings, identityProvider: createFakeIdentityProvider(identities) }
  )
  openServers.push(server)
  return { server, baseUrl: await listen(server), dataDirectory, time }
}

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-server-'))
  harness = await startHarness()
})

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)))
  )
  await rm(dataDirectory, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const request = (pathAndQuery: string, init: RequestInit = {}, server: Harness = harness) =>
  fetch(`${server.baseUrl}${pathAndQuery}`, { redirect: 'manual', ...init })

const setCookieNamed = (response: Response, name: string): string | undefined =>
  response.headers.getSetCookie().find((header) => header.startsWith(`${name}=`))

const pairOf = (setCookie: string | undefined): string => setCookie?.split(';')[0] ?? ''

/** Walks the sign-in as a browser would, and returns the session cookie it ends with. */
const signInAs = async (code: string, server: Harness = harness): Promise<string> => {
  const start = await request('/auth/google', {}, server)
  const loginCookie = pairOf(setCookieNamed(start, 'designo_login'))
  const state = new URL(start.headers.get('location') ?? '').searchParams.get('attempt')
  const callback = await request(
    `/auth/google/callback?code=${code}&state=state-${state}`,
    { headers: { Cookie: loginCookie } },
    server
  )
  return pairOf(setCookieNamed(callback, 'designo_session'))
}

const withCookie = (cookie: string, headers: Record<string, string> = {}) => ({
  headers: { Cookie: cookie, ...headers }
})

/** Sends a request line untouched, which `fetch` would not: it resolves `..` segments itself. */
const rawStatus = (
  method: string,
  rawPath: string,
  cookie: string,
  body?: string
): Promise<number> =>
  new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      `${harness.baseUrl}`,
      { method, path: rawPath, headers: { Cookie: cookie, 'Content-Type': 'application/json' } },
      (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      }
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })

const accountsOnDisk = async (): Promise<Account[]> =>
  createAccountStore(dataDirectory)
    .list()
    .then((accounts) => [...accounts])

const setStatusOnDisk = async (email: string, status: Account['status']): Promise<void> => {
  const file = path.join(dataDirectory, 'accounts.json')
  const stored = JSON.parse(await readFile(file, 'utf8'))
  const changed = stored.accounts.map((account: Account) =>
    account.email === email ? { ...account, status } : account
  )
  await writeFile(file, JSON.stringify({ ...stored, accounts: changed }))
}

const accountIdOf = async (email: string): Promise<string> => {
  const account = (await accountsOnDisk()).find((candidate) => candidate.email === email)
  if (!account) throw new Error(`No account for ${email}`)
  return account.id
}

describe('with sign-in off', () => {
  beforeEach(async () => {
    harness = await startHarness('sign-in-off')
    await writeDocument(dataDirectory, createDocument('file-1', 'One', 'page'))
  })

  it('serves the files API with no login, from the data folder', async () => {
    const response = await request('/api/files')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'file-1', name: 'One', nodeCount: 1 }])
  })

  it('answers /api/me with authEnabled false, not an error', async () => {
    const response = await request('/api/me')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ authEnabled: false })
  })

  it('has no sign-in routes: they fall through to the static editor', async () => {
    expect(await (await request('/auth/google')).text()).toBe('static editor')
    expect(await (await request('/auth/logout', { method: 'POST' })).text()).toBe('static editor')
  })
})

describe('signed out', () => {
  it('serves the editor to anyone so the sign-in page can load', async () => {
    expect(await (await request('/')).text()).toBe('static editor')
    expect(await (await request('/assets/app.js')).text()).toBe('static editor')
  })

  it('refuses the files API with 401, for reads and writes', async () => {
    expect((await request('/api/files')).status).toBe(401)
    expect((await request('/api/files/file-1')).status).toBe(401)
    const write = await request('/api/files/file-1/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [] })
    })
    expect(write.status).toBe(401)
  })

  it('answers /api/me with 401', async () => {
    const response = await request('/api/me')
    expect(response.status).toBe(401)
  })
})

describe('starting sign-in', () => {
  it('redirects to the provider and keeps the attempt in a short-lived signed cookie', async () => {
    const response = await request('/auth/google')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('https://accounts.example.com/authorize')
    const cookie = setCookieNamed(response, 'designo_login') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/auth/google')
    expect(cookie).toContain('Max-Age=600')
    expect(cookie).not.toContain('Secure')
  })

  it('marks cookies Secure when the public URL is https', async () => {
    const secure = await startHarness(
      makeSettings({ publicUrl: 'https://designo.example.com', secureCookies: true })
    )
    const response = await request('/auth/google', {}, secure)
    expect(setCookieNamed(response, 'designo_login')).toContain('; Secure')
    const session = await request(
      '/auth/google/callback?code=admin&state=state-1',
      { headers: { Cookie: pairOf(setCookieNamed(response, 'designo_login')) } },
      secure
    )
    expect(setCookieNamed(session, 'designo_session')).toContain('; Secure')
  })

  it('goes home with a notice when the provider cannot be reached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken = createProductionServer({
      dataDirectory,
      serveStatic: staticStub,
      settings: makeSettings(),
      identityProvider: {
        createAuthorizationRequest: () => Promise.reject(new Error('network down')),
        exchangeCallback: () => Promise.reject(new Error('network down'))
      }
    })
    openServers.push(broken)
    const response = await fetch(`${await listen(broken)}/auth/google`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
  })
})

describe('the callback', () => {
  it('signs an admin in: approved, a session cookie, and home', async () => {
    const start = await request('/auth/google')
    const callback = await request('/auth/google/callback?code=admin&state=state-1', {
      headers: { Cookie: pairOf(setCookieNamed(start, 'designo_login')) }
    })
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/')
    const session = setCookieNamed(callback, 'designo_session') ?? ''
    ;['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${7 * 24 * 60 * 60}`].forEach((attribute) => {
      expect(session).toContain(attribute)
    })
    expect(setCookieNamed(callback, 'designo_login')).toContain('Max-Age=0')
    const me = await request('/api/me', withCookie(pairOf(session)))
    expect(await me.json()).toEqual({
      email: 'admin@example.com',
      name: 'Ada',
      status: 'approved',
      isAdmin: true
    })
  })

  it('refuses a replayed callback: the same state cannot be used twice', async () => {
    const start = await request('/auth/google')
    const loginCookie = pairOf(setCookieNamed(start, 'designo_login'))
    const callbackPath = '/auth/google/callback?code=stranger&state=state-1'
    const first = await request(callbackPath, { headers: { Cookie: loginCookie } })
    expect(first.headers.get('location')).toBe('/')
    const replay = await request(callbackPath, { headers: { Cookie: loginCookie } })
    expect(replay.status).toBe(302)
    expect(replay.headers.get('location')).toBe('/?sign_in=failed')
    expect(setCookieNamed(replay, 'designo_session')).toBeUndefined()
  })

  it('refuses a state that is not the one in the cookie, and makes no account', async () => {
    const start = await request('/auth/google')
    const response = await request('/auth/google/callback?code=admin&state=state-99', {
      headers: { Cookie: pairOf(setCookieNamed(start, 'designo_login')) }
    })
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
    expect(setCookieNamed(response, 'designo_session')).toBeUndefined()
    expect(await accountsOnDisk()).toEqual([])
  })

  it('refuses a callback with no state in the URL', async () => {
    const start = await request('/auth/google')
    const response = await request('/auth/google/callback?code=admin', {
      headers: { Cookie: pairOf(setCookieNamed(start, 'designo_login')) }
    })
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
  })

  it('refuses a callback that arrives without the state cookie', async () => {
    await request('/auth/google')
    const response = await request('/auth/google/callback?code=admin&state=state-1')
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
    expect(setCookieNamed(response, 'designo_session')).toBeUndefined()
    expect(await accountsOnDisk()).toEqual([])
  })

  it('refuses a state cookie forged without the secret', async () => {
    const forged = Buffer.from(
      JSON.stringify({
        purpose: 'login',
        payload: { state: 'state-1', nonce: 'n', codeVerifier: 'v', expiresAt: START_TIME + 60_000 }
      })
    ).toString('base64url')
    const response = await request('/auth/google/callback?code=admin&state=state-1', {
      headers: { Cookie: `designo_login=${forged}.AAAA` }
    })
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
    expect(await accountsOnDisk()).toEqual([])
  })

  it('refuses a state cookie older than ten minutes', async () => {
    const start = await request('/auth/google')
    harness.time.now += 10 * 60 * 1000 + 1
    const response = await request('/auth/google/callback?code=admin&state=state-1', {
      headers: { Cookie: pairOf(setCookieNamed(start, 'designo_login')) }
    })
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
  })

  it('refuses when the provider rejects the exchange', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const start = await request('/auth/google')
    const response = await request('/auth/google/callback?code=nobody&state=state-1', {
      headers: { Cookie: pairOf(setCookieNamed(start, 'designo_login')) }
    })
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
    expect(await accountsOnDisk()).toEqual([])
  })

  it('does not accept a session cookie as a sign-in attempt', async () => {
    const session = await signInAs('admin')
    const response = await request('/auth/google/callback?code=admin&state=state-1', {
      headers: { Cookie: session.replace('designo_session=', 'designo_login=') }
    })
    expect(response.headers.get('location')).toBe('/?sign_in=failed')
  })
})

describe('approval', () => {
  it('leaves an unlisted account pending: it sees itself but not the designs API', async () => {
    const cookie = await signInAs('stranger')
    const me = await request('/api/me', withCookie(cookie))
    expect(await me.json()).toEqual({
      email: 'stranger@example.com',
      name: 'Sam',
      status: 'pending',
      isAdmin: false
    })
    const list = await request('/api/files', withCookie(cookie))
    expect(list.status).toBe(403)
    expect((await list.json()).error).toContain('waiting for approval')
    const write = await request('/api/files/file-1/operations', {
      method: 'POST',
      ...withCookie(cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ operations: [] })
    })
    expect(write.status).toBe(403)
  })

  it('approves an address on an auto-approve domain', async () => {
    const cookie = await signInAs('friend')
    expect((await request('/api/files', withCookie(cookie))).status).toBe(200)
  })

  it.each(['fake', 'fakeFriend'])(
    'keeps an unverified address that matches a rule pending (%s)',
    async (code) => {
      const cookie = await signInAs(code)
      const me = await (await request('/api/me', withCookie(cookie))).json()
      expect(me).toMatchObject({ status: 'pending', isAdmin: false })
      expect((await request('/api/files', withCookie(cookie))).status).toBe(403)
    }
  )

  it('approves an admin at sign-in even when the account was made pending before it was listed', async () => {
    const beforeListing = await startHarness(makeSettings({ adminEmails: [] }))
    const pendingCookie = await signInAs('admin', beforeListing)
    expect((await request('/api/files', withCookie(pendingCookie), beforeListing)).status).toBe(403)
    const afterListing = await startHarness(makeSettings({ adminEmails: ['admin@example.com'] }))
    const cookie = await signInAs('admin', afterListing)
    expect((await request('/api/files', withCookie(cookie), afterListing)).status).toBe(200)
    expect(await accountsOnDisk()).toHaveLength(1)
  })

  it('approves an admin who was blocked, at the next sign-in', async () => {
    await signInAs('admin')
    await setStatusOnDisk('admin@example.com', 'blocked')
    const cookie = await signInAs('admin')
    expect((await request('/api/files', withCookie(cookie))).status).toBe(200)
  })

  it('lets an account in the moment an admin approves it, with no new sign-in', async () => {
    const cookie = await signInAs('stranger')
    expect((await request('/api/files', withCookie(cookie))).status).toBe(403)
    await setStatusOnDisk('stranger@example.com', 'approved')
    expect((await request('/api/files', withCookie(cookie))).status).toBe(200)
  })

  it('refuses a blocked account on its very next request', async () => {
    const cookie = await signInAs('admin')
    expect((await request('/api/files', withCookie(cookie))).status).toBe(200)
    await setStatusOnDisk('admin@example.com', 'blocked')
    const refused = await request('/api/files', withCookie(cookie))
    expect(refused.status).toBe(403)
    expect((await refused.json()).error).toContain('blocked')
    const me = await (await request('/api/me', withCookie(cookie))).json()
    expect(me.status).toBe('blocked')
  })

  it('does not change a blocked account back by signing in again', async () => {
    await signInAs('stranger')
    await setStatusOnDisk('stranger@example.com', 'blocked')
    const cookie = await signInAs('stranger')
    expect((await (await request('/api/me', withCookie(cookie))).json()).status).toBe('blocked')
  })
})

describe('forged and expired sessions', () => {
  const sessionPayload = (accountId: string, expiresAt: number) =>
    Buffer.from(JSON.stringify({ purpose: 'session', payload: { accountId, expiresAt } })).toString(
      'base64url'
    )

  it.each(['nonsense', 'a.b', '.', '', 'a.b.c'])(
    'treats the made-up cookie %j as signed out',
    async (value) => {
      const response = await request('/api/me', withCookie(`designo_session=${value}`))
      expect(response.status).toBe(401)
    }
  )

  it('treats a cookie that names a real account but is not signed as signed out', async () => {
    await signInAs('admin')
    const accountId = await accountIdOf('admin@example.com')
    const forged = `designo_session=${sessionPayload(accountId, START_TIME + SEVEN_DAYS)}.AAAA`
    expect((await request('/api/me', withCookie(forged))).status).toBe(401)
    expect((await request('/api/files', withCookie(forged))).status).toBe(401)
  })

  it('treats a tampered cookie as signed out', async () => {
    const cookie = await signInAs('admin')
    const [name, value = ''] = cookie.split('=')
    const [, signature = ''] = value.split('.')
    const accountId = await accountIdOf('admin@example.com')
    const swapped = `${name}=${sessionPayload(accountId, START_TIME + 10 * SEVEN_DAYS)}.${signature}`
    expect((await request('/api/me', withCookie(swapped))).status).toBe(401)
  })

  it('treats a cookie signed with another secret as signed out', async () => {
    const elsewhere = await startHarness(makeSettings({ sessionSecret: OTHER_SECRET }))
    const foreign = await signInAs('admin', elsewhere)
    expect(foreign).toContain('designo_session=')
    // Same account store on disk, so only the signing key differs.
    expect((await request('/api/me', withCookie(foreign))).status).toBe(401)
    expect((await request('/api/me', withCookie(foreign), elsewhere)).status).toBe(200)
  })

  it('treats an expired cookie as signed out', async () => {
    const cookie = await signInAs('admin')
    harness.time.now += SEVEN_DAYS - 1000
    expect((await request('/api/me', withCookie(cookie))).status).toBe(200)
    harness.time.now += 2000
    expect((await request('/api/me', withCookie(cookie))).status).toBe(401)
    expect((await request('/api/files', withCookie(cookie))).status).toBe(401)
  })

  it('treats a cookie for an account that no longer exists as signed out', async () => {
    const cookie = await signInAs('admin')
    await writeFile(
      path.join(dataDirectory, 'accounts.json'),
      JSON.stringify({ formatVersion: 1, accounts: [] })
    )
    expect((await request('/api/me', withCookie(cookie))).status).toBe(401)
  })

  it('does not take a login cookie for a session', async () => {
    const start = await request('/auth/google')
    const loginAsSession = pairOf(setCookieNamed(start, 'designo_login')).replace(
      'designo_login=',
      'designo_session='
    )
    expect((await request('/api/me', withCookie(loginAsSession))).status).toBe(401)
  })
})

describe('signing out', () => {
  it('clears the session cookie', async () => {
    const cookie = await signInAs('admin')
    const response = await request('/auth/logout', { method: 'POST', ...withCookie(cookie) })
    expect(response.status).toBe(204)
    expect(setCookieNamed(response, 'designo_session')).toContain('Max-Age=0')
  })

  it('revokes the session: a cookie copied before sign-out is refused after it', async () => {
    const cookie = await signInAs('admin')
    const copy = `${cookie}`
    expect((await request('/api/me', withCookie(copy))).status).toBe(200)
    await request('/auth/logout', { method: 'POST', ...withCookie(cookie) })
    expect((await request('/api/me', withCookie(copy))).status).toBe(401)
    expect((await request('/api/files', withCookie(copy))).status).toBe(401)
  })

  it('lets the account sign in again after signing out', async () => {
    const before = await signInAs('admin')
    await request('/auth/logout', { method: 'POST', ...withCookie(before) })
    const after = await signInAs('admin')
    expect((await request('/api/me', withCookie(after))).status).toBe(200)
    expect((await request('/api/files', withCookie(after))).status).toBe(200)
    expect((await request('/api/me', withCookie(before))).status).toBe(401)
  })

  it('refuses a cookie signed with an old epoch, even though the signature is good', async () => {
    await signInAs('admin')
    const accountId = await accountIdOf('admin@example.com')
    const current = createSessionValue(accountId, 0, START_TIME, SESSION_SECRET)
    expect((await request('/api/me', withCookie(`designo_session=${current}`))).status).toBe(200)
    await createAccountStore(dataDirectory).revokeSessions(accountId)
    expect((await request('/api/me', withCookie(`designo_session=${current}`))).status).toBe(401)
    const renewed = createSessionValue(accountId, 1, START_TIME, SESSION_SECRET)
    expect((await request('/api/me', withCookie(`designo_session=${renewed}`))).status).toBe(200)
  })

  it("ends the account's other sessions too, and leaves other accounts signed in", async () => {
    const adminBrowser = await signInAs('admin')
    const adminPhone = await signInAs('admin')
    const friend = await signInAs('friend')
    await request('/auth/logout', { method: 'POST', ...withCookie(adminBrowser) })
    expect((await request('/api/me', withCookie(adminPhone))).status).toBe(401)
    expect((await request('/api/me', withCookie(friend))).status).toBe(200)
  })

  it('changes nothing when the cookie is forged or already revoked', async () => {
    const cookie = await signInAs('admin')
    await request('/auth/logout', { method: 'POST', ...withCookie(cookie) })
    await request('/auth/logout', { method: 'POST', ...withCookie(cookie) })
    await request('/auth/logout', { method: 'POST', ...withCookie('designo_session=forged.value') })
    expect((await accountsOnDisk())[0]?.sessionEpoch).toBe(1)
  })

  it('refuses a sign-out another site triggers, and a GET', async () => {
    const cookie = await signInAs('admin')
    const crossSite = await request('/auth/logout', {
      method: 'POST',
      ...withCookie(cookie, { Origin: 'https://evil.example' })
    })
    expect(crossSite.status).toBe(403)
    expect((await request('/auth/logout', withCookie(cookie))).status).toBe(405)
  })
})

describe('designs belong to accounts', () => {
  const seedDesign = async (email: string, fileId: string, name: string): Promise<void> => {
    await writeDocument(
      accountDirectory(dataDirectory, await accountIdOf(email)),
      createDocument(fileId, name, 'page')
    )
  }

  const postOperations = (cookie: string, fileId: string) =>
    request(`/api/files/${fileId}/operations`, {
      method: 'POST',
      ...withCookie(cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        operations: [{ kind: 'create', id: 'box', type: 'rectangle', parentId: 'page' }]
      })
    })

  let adminCookie: string
  let friendCookie: string

  beforeEach(async () => {
    adminCookie = await signInAs('admin')
    friendCookie = await signInAs('friend')
    await seedDesign('admin@example.com', 'secret-plan', 'Admin only')
    await seedDesign('friend@team.example.com', 'friends-file', 'Friend only')
  })

  it('lists only the signed-in account’s own designs', async () => {
    const admin = await (await request('/api/files', withCookie(adminCookie))).json()
    const friend = await (await request('/api/files', withCookie(friendCookie))).json()
    expect(admin).toEqual([{ id: 'secret-plan', name: 'Admin only', nodeCount: 1 }])
    expect(friend).toEqual([{ id: 'friends-file', name: 'Friend only', nodeCount: 1 }])
  })

  it('answers 404, never 403, for another account’s file, read or write', async () => {
    const read = await request('/api/files/secret-plan', withCookie(friendCookie))
    expect(read.status).toBe(404)
    const write = await postOperations(friendCookie, 'secret-plan')
    expect(write.status).toBe(404)
    // Indistinguishable from a file that exists nowhere.
    expect(await read.json()).toEqual(
      await (await request('/api/files/no-such-file', withCookie(friendCookie))).json()
    )
    const adminFolder = accountDirectory(dataDirectory, await accountIdOf('admin@example.com'))
    expect(Object.keys((await readDocument(adminFolder, 'secret-plan')).nodes)).toEqual(['page'])
  })

  it('lets each account use the same file id for its own, separate design', async () => {
    await seedDesign('admin@example.com', 'shared-name', 'Admin copy')
    await seedDesign('friend@team.example.com', 'shared-name', 'Friend copy')
    const adminRead = await (
      await request('/api/files/shared-name', withCookie(adminCookie))
    ).json()
    const friendRead = await (
      await request('/api/files/shared-name', withCookie(friendCookie))
    ).json()
    expect([adminRead.name, friendRead.name]).toEqual(['Admin copy', 'Friend copy'])
    expect((await postOperations(adminCookie, 'shared-name')).status).toBe(200)
    expect(
      Object.keys(
        (await (await request('/api/files/shared-name', withCookie(friendCookie))).json()).nodes
      )
    ).toEqual(['page'])
  })

  it('names the account folder by its random id, not by sub or email', async () => {
    const folders = await readdir(path.join(dataDirectory, 'accounts'))
    expect(folders).toHaveLength(2)
    folders.forEach((folder) => {
      expect(folder).not.toContain('sub-')
      expect(folder).not.toContain('example')
    })
  })

  it('creates an account’s folder on first use', async () => {
    const stranger = await signInAs('stranger')
    await setStatusOnDisk('stranger@example.com', 'approved')
    const folder = accountDirectory(dataDirectory, await accountIdOf('stranger@example.com'))
    await expect(readdir(folder)).rejects.toThrow()
    expect((await request('/api/files', withCookie(stranger))).status).toBe(200)
    expect(await readdir(folder)).toEqual([])
  })

  it('cannot reach another account through ids with path tricks', async () => {
    const adminId = await accountIdOf('admin@example.com')
    const tricks = [
      '..',
      '../secret-plan',
      '%2e%2e%2fsecret-plan',
      '..%2Fsecret-plan',
      '%2e%2e/%2e%2e/secret-plan',
      `..%2Faccounts%2F${adminId}%2Fsecret-plan`,
      `${adminId}%2Fsecret-plan`,
      `${adminId}/secret-plan`,
      '%2Fetc%2Fpasswd',
      '/etc/passwd',
      'secret-plan%00',
      'secret-plan%2F..%2Fsecret-plan',
      'secret-plan.designo.json',
      '%5C..%5Csecret-plan',
      'secret-plan%0A',
      'SECRET-PLAN'
    ]
    // fetch would tidy `..` and `%2e%2e` away before sending, so these go out exactly as written.
    const operations = JSON.stringify({
      operations: [{ kind: 'create', id: 'box', type: 'rectangle', parentId: 'page' }]
    })
    const statuses = await Promise.all(
      tricks.map(async (trick) => ({
        trick,
        read: await rawStatus('GET', `/api/files/${trick}`, friendCookie),
        write: await rawStatus('POST', `/api/files/${trick}/operations`, friendCookie, operations)
      }))
    )
    statuses.forEach(({ read, write }) => {
      expect(read).toBe(404)
      expect(write).toBe(404)
    })
  })

  it('leaves designs in the data folder’s root untouched and invisible', async () => {
    await writeDocument(dataDirectory, createDocument('root-file', 'Old design', 'page'))
    const list = await (await request('/api/files', withCookie(adminCookie))).json()
    expect(list.map((file: { id: string }) => file.id)).toEqual(['secret-plan'])
    expect((await request('/api/files/root-file', withCookie(adminCookie))).status).toBe(404)
    expect((await postOperations(adminCookie, 'root-file')).status).toBe(404)
    expect((await readDocument(dataDirectory, 'root-file')).name).toBe('Old design')
  })

  it('still applies the same-origin JSON rule to writes', async () => {
    const wrongType = await request('/api/files/secret-plan/operations', {
      method: 'POST',
      ...withCookie(adminCookie, { 'Content-Type': 'text/plain' }),
      body: '{}'
    })
    expect(wrongType.status).toBe(415)
    const crossSite = await request('/api/files/secret-plan/operations', {
      method: 'POST',
      ...withCookie(adminCookie, {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example'
      }),
      body: JSON.stringify({ operations: [] })
    })
    expect(crossSite.status).toBe(403)
  })
})

const postStatus = (
  cookie: string,
  accountId: string,
  body: unknown,
  headers: Record<string, string> = {},
  server: Harness = harness
) =>
  request(
    `/api/admin/accounts/${accountId}/status`,
    {
      method: 'POST',
      ...withCookie(cookie, { 'Content-Type': 'application/json', ...headers }),
      body: JSON.stringify(body)
    },
    server
  )

describe('the admin routes', () => {
  it('lists every account for an approved admin, with only what the screen shows', async () => {
    const admin = await signInAs('admin')
    await signInAs('stranger')
    await signInAs('friend')
    const response = await request('/api/admin/accounts', withCookie(admin))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { accounts } = await response.json()
    expect(accounts).toEqual([
      expect.objectContaining({ email: 'admin@example.com', status: 'approved', isAdmin: true }),
      expect.objectContaining({ email: 'stranger@example.com', status: 'pending', isAdmin: false }),
      expect.objectContaining({
        email: 'friend@team.example.com',
        status: 'approved',
        isAdmin: false
      })
    ])
    expect(Object.keys(accounts[1]).sort()).toEqual(
      ['createdAt', 'email', 'id', 'isAdmin', 'name', 'status'].sort()
    )
    expect(accounts[1].createdAt).toBe(new Date(START_TIME).toISOString())
  })

  it('answers 404 to everyone who is not an approved admin, so the route does not show itself', async () => {
    const stranger = await signInAs('stranger')
    const friend = await signInAs('friend')
    const unverifiedAdmin = await signInAs('fake')
    const blockedAdmin = await signInAs('admin')
    await setStatusOnDisk('admin@example.com', 'blocked')
    const strangerId = await accountIdOf('stranger@example.com')
    const cases: [string, string | undefined][] = [
      ['signed out', undefined],
      ['pending', stranger],
      ['approved but not an admin', friend],
      ['an unverified address that is listed', unverifiedAdmin],
      ['a blocked admin', blockedAdmin]
    ]
    const answers = await Promise.all(
      cases.map(async ([label, cookie]) => {
        const headers = cookie ? withCookie(cookie, { 'Content-Type': 'application/json' }) : {}
        const read = await request('/api/admin/accounts', headers)
        const write = await request(`/api/admin/accounts/${strangerId}/status`, {
          method: 'POST',
          ...headers,
          body: JSON.stringify({ status: 'approved' })
        })
        const other = await request('/api/admin/anything', headers)
        return [label, read.status, write.status, other.status]
      })
    )
    expect(answers).toEqual(cases.map(([label]) => [label, 404, 404, 404]))
    expect((await accountsOnDisk()).find((account) => account.id === strangerId)?.status).toBe(
      'pending'
    )
  })

  it('approves a pending account, and it opens the designs with no new sign-in', async () => {
    const admin = await signInAs('admin')
    const stranger = await signInAs('stranger')
    const id = await accountIdOf('stranger@example.com')
    expect((await request('/api/files', withCookie(stranger))).status).toBe(403)
    const response = await postStatus(admin, id, { status: 'approved' })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id, status: 'approved', isAdmin: false })
    expect((await request('/api/files', withCookie(stranger))).status).toBe(200)
  })

  it('blocks an account on its very next request, and unblocks it again', async () => {
    const admin = await signInAs('admin')
    const friend = await signInAs('friend')
    const id = await accountIdOf('friend@team.example.com')
    expect((await postStatus(admin, id, { status: 'blocked' })).status).toBe(200)
    const refused = await request('/api/files', withCookie(friend))
    expect(refused.status).toBe(403)
    expect((await refused.json()).error).toContain('blocked')
    expect((await postStatus(admin, id, { status: 'approved' })).status).toBe(200)
    expect((await request('/api/files', withCookie(friend))).status).toBe(200)
  })

  it('refuses to block an admin, whoever asks: the settings list is what removes one', async () => {
    const both = await startHarness(
      makeSettings({ adminEmails: ['admin@example.com', 'friend@team.example.com'] })
    )
    const admin = await signInAs('admin', both)
    await signInAs('friend', both)
    const ownId = await accountIdOf('admin@example.com')
    const otherId = await accountIdOf('friend@team.example.com')
    const self = await postStatus(admin, ownId, { status: 'blocked' }, {}, both)
    expect(self.status).toBe(409)
    expect((await self.json()).error).toContain('DESIGNO_ADMIN_EMAILS')
    expect((await postStatus(admin, otherId, { status: 'blocked' }, {}, both)).status).toBe(409)
    expect((await accountsOnDisk()).map((account) => account.status)).toEqual([
      'approved',
      'approved'
    ])
  })

  it('lets an admin approve an admin, which changes nothing', async () => {
    const admin = await signInAs('admin')
    const id = await accountIdOf('admin@example.com')
    expect((await postStatus(admin, id, { status: 'approved' })).status).toBe(200)
  })

  it('stops an admin whose address leaves the list from using the screen', async () => {
    const admin = await signInAs('admin')
    const afterRemoval = await startHarness(makeSettings({ adminEmails: [] }))
    expect((await request('/api/admin/accounts', withCookie(admin), afterRemoval)).status).toBe(404)
  })

  it('refuses a change another site triggers, and one that is not JSON', async () => {
    const admin = await signInAs('admin')
    await signInAs('stranger')
    const id = await accountIdOf('stranger@example.com')
    const crossSite = await postStatus(
      admin,
      id,
      { status: 'approved' },
      {
        Origin: 'https://evil.example'
      }
    )
    expect(crossSite.status).toBe(403)
    const notJson = await request(`/api/admin/accounts/${id}/status`, {
      method: 'POST',
      ...withCookie(admin, { 'Content-Type': 'text/plain' }),
      body: JSON.stringify({ status: 'approved' })
    })
    expect(notJson.status).toBe(415)
    expect((await accountsOnDisk()).find((account) => account.id === id)?.status).toBe('pending')
  })

  it.each([
    ['an unknown status', { status: 'root' }],
    ['pending, which an admin cannot choose', { status: 'pending' }],
    ['no status', {}],
    ['extra fields', { status: 'approved', email: 'x@example.com' }],
    ['a body that is not an object', ['approved']]
  ])('refuses %s with 400', async (_label, body) => {
    const admin = await signInAs('admin')
    await signInAs('stranger')
    const id = await accountIdOf('stranger@example.com')
    expect((await postStatus(admin, id, body)).status).toBe(400)
    expect((await accountsOnDisk()).find((account) => account.id === id)?.status).toBe('pending')
  })

  it('refuses a body that is not JSON with 400', async () => {
    const admin = await signInAs('admin')
    const response = await request('/api/admin/accounts/abc/status', {
      method: 'POST',
      ...withCookie(admin, { 'Content-Type': 'application/json' }),
      body: '{not json'
    })
    expect(response.status).toBe(400)
  })

  it('answers 404 for an account that does not exist, and for ids with path tricks', async () => {
    const admin = await signInAs('admin')
    expect((await postStatus(admin, 'no-such-account', { status: 'blocked' })).status).toBe(404)
    await Promise.all(
      ['..', '%2e%2e', 'a%2Fb', 'x'.repeat(65), '%00'].map(async (id) => {
        expect(
          await rawStatus(
            'POST',
            `/api/admin/accounts/${id}/status`,
            admin,
            JSON.stringify({ status: 'blocked' })
          )
        ).toBe(404)
      })
    )
  })

  it('answers 405 to a method the route does not take', async () => {
    const admin = await signInAs('admin')
    const id = await accountIdOf('admin@example.com')
    expect(
      (await request('/api/admin/accounts', { method: 'POST', ...withCookie(admin) })).status
    ).toBe(405)
    expect((await request(`/api/admin/accounts/${id}/status`, withCookie(admin))).status).toBe(405)
  })

  it('has no admin routes with sign-in off: they fall through to the static editor', async () => {
    const off = await startHarness('sign-in-off')
    const response = await request('/api/admin/accounts', {}, off)
    expect(await response.text()).toBe('static editor')
  })

  it('keeps emails out of the log', async () => {
    const logged: string[] = []
    const capture = (...parts: unknown[]): void => {
      logged.push(parts.map(String).join(' '))
    }
    vi.spyOn(console, 'error').mockImplementation(capture)
    vi.spyOn(console, 'warn').mockImplementation(capture)
    vi.spyOn(console, 'log').mockImplementation(capture)
    const admin = await signInAs('admin')
    await signInAs('stranger')
    const id = await accountIdOf('stranger@example.com')
    await request('/api/admin/accounts', withCookie(admin))
    await postStatus(admin, id, { status: 'blocked' })
    await postStatus(admin, id, { status: 'nonsense' })
    expect(logged.join('\n')).not.toContain('@')
  })
})

describe('what is never exposed', () => {
  it('keeps secrets and cookies out of every body and every log line', async () => {
    const logged: string[] = []
    const capture = (...parts: unknown[]): void => {
      logged.push(parts.map(String).join(' '))
    }
    vi.spyOn(console, 'error').mockImplementation(capture)
    vi.spyOn(console, 'warn').mockImplementation(capture)
    vi.spyOn(console, 'log').mockImplementation(capture)

    const bodies: string[] = []
    const record = async (response: Response): Promise<Response> => {
      bodies.push(await response.clone().text())
      return response
    }
    const admin = await signInAs('admin')
    const stranger = await signInAs('stranger')
    const start = await record(await request('/auth/google'))
    const sessionSecretValues = [admin.split('=')[1] ?? '', stranger.split('=')[1] ?? '']
    await record(await request('/api/me', withCookie(admin)))
    await record(await request('/api/me'))
    await record(await request('/api/files', withCookie(stranger)))
    await record(await request('/api/files', withCookie(admin)))
    await record(await request('/api/files/x', withCookie(admin)))
    await record(await request('/auth/google/callback?code=nobody&state=state-1'))
    await record(await request('/auth/google/callback?error=access_denied'))
    await record(await request('/api/files', withCookie('designo_session=forged.value')))
    await record(await request('/auth/logout', { method: 'POST', ...withCookie(admin) }))

    const everything = [...bodies, ...logged, start.headers.get('location') ?? ''].join('\n')
    ;[CLIENT_SECRET, SESSION_SECRET, ...sessionSecretValues].forEach((secret) => {
      expect(secret).not.toBe('')
      expect(everything).not.toContain(secret)
    })
  })

  it('answers a damaged accounts file with a plain 500 that says nothing about it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cookie = await signInAs('admin')
    await writeFile(path.join(dataDirectory, 'accounts.json'), 'secret-looking {garbage')
    const response = await request('/api/me', withCookie(cookie))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal error' })
  })
})
