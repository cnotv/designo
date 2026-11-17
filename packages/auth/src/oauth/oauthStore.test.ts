import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACCESS_TOKEN_LIFETIME_MILLISECONDS,
  REFRESH_TOKEN_LIFETIME_MILLISECONDS,
  createOAuthStore
} from './oauthStore.ts'
import type { OAuthStore } from './types.ts'

const START = 1_700_000_000_000
// Small limits keep the tests that fill the store quick; the real ones are only larger numbers.
const MAX_CLIENTS = 5
const MAX_GRANTS_PER_ACCOUNT = 3
const MAX_GRANTS = 6
const limits = {
  maxClients: MAX_CLIENTS,
  maxGrantsPerAccount: MAX_GRANTS_PER_ACCOUNT,
  maxGrants: MAX_GRANTS
}
const newClient = { clientName: 'Claude Code', redirectUris: ['http://localhost:1234/cb'] }

let dataDirectory: string
let time: { now: number }
let store: OAuthStore

const storeFilePath = (): string => path.join(dataDirectory, 'oauth.json')

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-oauth-'))
  time = { now: START }
  store = createOAuthStore(dataDirectory, () => time.now, { limits })
})

afterEach(async () => {
  await rm(dataDirectory, { recursive: true, force: true })
})

const registerClientOrFail = async (name = 'Claude Code') => {
  const client = await store.registerClient({ ...newClient, clientName: name })
  if (!client) throw new Error('The store refused a client')
  return client
}

describe('clients', () => {
  it('stores a client and finds it again by its id', async () => {
    const client = await registerClientOrFail()
    expect(client).toMatchObject(newClient)
    expect(client.clientId).toMatch(/^[\w-]{16,}$/)
    expect(await store.findClient(client.clientId)).toEqual(client)
  })

  it('does not know a client it never stored', async () => {
    expect(await store.findClient('nobody')).toBeUndefined()
  })

  it('gives every client its own id', async () => {
    const [first, second] = [await registerClientOrFail(), await registerClientOrFail()]
    expect(first.clientId).not.toBe(second.clientId)
  })

  it('makes room for a new client by dropping the oldest one nobody uses', async () => {
    const first = await registerClientOrFail('first')
    await Promise.all(
      Array.from({ length: MAX_CLIENTS - 1 }, (_, index) => registerClientOrFail(`c${index}`))
    )
    const newest = await registerClientOrFail('newest')
    expect(await store.findClient(first.clientId)).toBeUndefined()
    expect(await store.findClient(newest.clientId)).toBeDefined()
  })

  it('refuses a new client when every stored client is in use', async () => {
    const clients = await Promise.all(
      Array.from({ length: MAX_CLIENTS }, (_, index) => registerClientOrFail(`c${index}`))
    )
    await Promise.all(
      clients.map((client, index) =>
        store.createGrant({ clientId: client.clientId, accountId: `acc-${index}` })
      )
    )
    expect(await store.registerClient(newClient)).toBeUndefined()
  })

  it('forgets a client nobody used for thirty days', async () => {
    const client = await registerClientOrFail()
    time.now += 31 * 24 * 60 * 60 * 1000
    await registerClientOrFail('later')
    expect(await store.findClient(client.clientId)).toBeUndefined()
  })
})

describe('tokens', () => {
  it('makes two different unguessable tokens that identify the grant', async () => {
    const client = await registerClientOrFail()
    const tokens = await store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
    expect(tokens.accessToken).not.toBe(tokens.refreshToken)
    expect(tokens.accessToken.length).toBeGreaterThanOrEqual(43)
    expect(tokens.accessTokenLifetimeSeconds).toBe(ACCESS_TOKEN_LIFETIME_MILLISECONDS / 1000)
    expect(await store.authenticateAccessToken(tokens.accessToken)).toEqual({
      grantId: tokens.grantId,
      accountId: 'acc-1',
      clientId: client.clientId
    })
  })

  it('never writes a token to disk, only its hash', async () => {
    const client = await registerClientOrFail()
    const tokens = await store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
    const contents = await readFile(storeFilePath(), 'utf8')
    expect(contents).not.toContain(tokens.accessToken)
    expect(contents).not.toContain(tokens.refreshToken)
    expect(contents).toMatch(/[\da-f]{64}/)
  })

  it('keeps the file readable by its owner only', async () => {
    await registerClientOrFail()
    expect((await stat(storeFilePath())).mode & 0o777).toBe(0o600)
  })

  it('does not know an access token it never made', async () => {
    expect(await store.authenticateAccessToken('guess')).toBeUndefined()
    expect(await store.authenticateAccessToken('')).toBeUndefined()
  })

  it('stops honouring an access token after an hour', async () => {
    const client = await registerClientOrFail()
    const tokens = await store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
    time.now += ACCESS_TOKEN_LIFETIME_MILLISECONDS - 1
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeDefined()
    time.now += 1
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeUndefined()
  })
})

describe('refresh tokens', () => {
  const grantFor = async (accountId = 'acc-1') => {
    const client = await registerClientOrFail()
    const tokens = await store.createGrant({ clientId: client.clientId, accountId })
    return { client, tokens }
  }

  it('trades a refresh token for a new pair and retires the old pair', async () => {
    const { client, tokens } = await grantFor()
    const outcome = await store.rotateRefreshToken({
      refreshToken: tokens.refreshToken,
      clientId: client.clientId
    })
    if (outcome.kind !== 'issued') throw new Error(`Expected a new pair, got ${outcome.kind}`)
    expect(outcome.tokens.grantId).toBe(tokens.grantId)
    expect(outcome.tokens.accessToken).not.toBe(tokens.accessToken)
    expect(outcome.tokens.refreshToken).not.toBe(tokens.refreshToken)
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeUndefined()
    expect(await store.authenticateAccessToken(outcome.tokens.accessToken)).toBeDefined()
  })

  it('revokes the whole grant when a traded-in refresh token comes back', async () => {
    const { client, tokens } = await grantFor()
    const first = await store.rotateRefreshToken({
      refreshToken: tokens.refreshToken,
      clientId: client.clientId
    })
    const reuse = await store.rotateRefreshToken({
      refreshToken: tokens.refreshToken,
      clientId: client.clientId
    })
    expect(reuse).toEqual({ kind: 'reused' })
    if (first.kind !== 'issued') throw new Error('The first trade should work')
    expect(await store.authenticateAccessToken(first.tokens.accessToken)).toBeUndefined()
    expect(
      await store.rotateRefreshToken({
        refreshToken: first.tokens.refreshToken,
        clientId: client.clientId
      })
    ).toEqual({ kind: 'invalid' })
    expect(await store.listAccountGrants('acc-1')).toEqual([])
  })

  it('refuses a refresh token presented by another client, without revoking anything', async () => {
    const { tokens } = await grantFor()
    const other = await registerClientOrFail('other')
    expect(
      await store.rotateRefreshToken({
        refreshToken: tokens.refreshToken,
        clientId: other.clientId
      })
    ).toEqual({ kind: 'invalid' })
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeDefined()
  })

  it('refuses a refresh token after thirty days', async () => {
    const { client, tokens } = await grantFor()
    time.now += REFRESH_TOKEN_LIFETIME_MILLISECONDS
    expect(
      await store.rotateRefreshToken({
        refreshToken: tokens.refreshToken,
        clientId: client.clientId
      })
    ).toEqual({ kind: 'invalid' })
  })

  it('refuses a refresh token it never made, and an access token in its place', async () => {
    const { client, tokens } = await grantFor()
    expect(
      await store.rotateRefreshToken({ refreshToken: 'guess', clientId: client.clientId })
    ).toEqual({ kind: 'invalid' })
    expect(
      await store.rotateRefreshToken({
        refreshToken: tokens.accessToken,
        clientId: client.clientId
      })
    ).toEqual({ kind: 'invalid' })
  })

  it('lets only one of two simultaneous trades of the same token succeed', async () => {
    const { client, tokens } = await grantFor()
    const request = { refreshToken: tokens.refreshToken, clientId: client.clientId }
    const outcomes = await Promise.all([
      store.rotateRefreshToken(request),
      store.rotateRefreshToken(request)
    ])
    expect(outcomes.map((outcome) => outcome.kind).toSorted()).toEqual(['issued', 'reused'])
  })
})

describe('revoking', () => {
  const grantFor = async (accountId = 'acc-1') => {
    const client = await registerClientOrFail()
    return {
      client,
      tokens: await store.createGrant({ clientId: client.clientId, accountId })
    }
  }

  it('ends a grant when either of its tokens is revoked', async () => {
    const byAccess = await grantFor()
    const byRefresh = await grantFor()
    await store.revokeToken(byAccess.tokens.accessToken)
    await store.revokeToken(byRefresh.tokens.refreshToken)
    expect(await store.authenticateAccessToken(byAccess.tokens.accessToken)).toBeUndefined()
    expect(await store.authenticateAccessToken(byRefresh.tokens.accessToken)).toBeUndefined()
  })

  it('ignores a token for another client when the client is named', async () => {
    const { tokens } = await grantFor()
    await store.revokeToken(tokens.accessToken, 'someone-else')
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeDefined()
  })

  it('treats an unknown token as nothing to do', async () => {
    await expect(store.revokeToken('guess')).resolves.toBeUndefined()
  })

  it('revokes a grant by id', async () => {
    const { tokens } = await grantFor()
    await store.revokeGrant(tokens.grantId)
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeUndefined()
  })

  it('revokes an account grant only for the account that owns it', async () => {
    const { tokens } = await grantFor('acc-1')
    expect(await store.revokeAccountGrant('acc-2', tokens.grantId)).toBe(false)
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeDefined()
    expect(await store.revokeAccountGrant('acc-1', tokens.grantId)).toBe(true)
    expect(await store.authenticateAccessToken(tokens.accessToken)).toBeUndefined()
  })
})

describe('listing an account grants', () => {
  it('lists only that account, with the client name and when it was connected', async () => {
    const claude = await registerClientOrFail('Claude Code')
    const inspector = await registerClientOrFail('Inspector')
    const mine = await store.createGrant({ clientId: claude.clientId, accountId: 'acc-1' })
    await store.createGrant({ clientId: inspector.clientId, accountId: 'acc-2' })
    expect(await store.listAccountGrants('acc-1')).toEqual([
      {
        id: mine.grantId,
        clientName: 'Claude Code',
        connectedAt: new Date(START).toISOString(),
        expiresAt: new Date(START + REFRESH_TOKEN_LIFETIME_MILLISECONDS).toISOString()
      }
    ])
  })

  it('never includes a hash or a token', async () => {
    const client = await registerClientOrFail()
    const tokens = await store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
    const listed = JSON.stringify(await store.listAccountGrants('acc-1'))
    expect(listed).not.toContain(tokens.accessToken)
    expect(listed).not.toMatch(/[\da-f]{64}/)
  })

  it('keeps a bounded number of grants per account, dropping the oldest', async () => {
    const client = await registerClientOrFail()
    const first = await store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
    await Promise.all(
      Array.from({ length: MAX_GRANTS_PER_ACCOUNT }, () =>
        store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
      )
    )
    expect(await store.listAccountGrants('acc-1')).toHaveLength(MAX_GRANTS_PER_ACCOUNT)
    expect(await store.authenticateAccessToken(first.accessToken)).toBeUndefined()
  })

  it('forgets grants whose refresh token has expired', async () => {
    const client = await registerClientOrFail()
    await store.createGrant({ clientId: client.clientId, accountId: 'acc-1' })
    time.now += REFRESH_TOKEN_LIFETIME_MILLISECONDS
    expect(await store.listAccountGrants('acc-1')).toEqual([])
  })
})

describe('limits', () => {
  it('drops the oldest grant of the whole store beyond the overall limit', async () => {
    const client = await registerClientOrFail()
    const first = await store.createGrant({ clientId: client.clientId, accountId: 'acc-0' })
    await Promise.all(
      Array.from({ length: MAX_GRANTS }, (_, index) =>
        store.createGrant({ clientId: client.clientId, accountId: `acc-${index + 1}` })
      )
    )
    expect(await store.authenticateAccessToken(first.accessToken)).toBeUndefined()
  })
})

describe('the file', () => {
  it('is checked on every read: a damaged file stops everything instead of being guessed at', async () => {
    await registerClientOrFail()
    await writeFile(storeFilePath(), JSON.stringify({ formatVersion: 1, clients: 'nope' }))
    await expect(store.findClient('x')).rejects.toThrow()
    await expect(store.authenticateAccessToken('x')).rejects.toThrow()
  })

  it('is read as empty when it does not exist yet', async () => {
    expect(await store.listAccountGrants('acc-1')).toEqual([])
  })

  it('survives many writes at once without losing any', async () => {
    const clients = await Promise.all(
      Array.from({ length: MAX_CLIENTS - 1 }, (_, index) => registerClientOrFail(`c${index}`))
    )
    const found = await Promise.all(clients.map((client) => store.findClient(client.clientId)))
    expect(found.every((client) => client !== undefined)).toBe(true)
  })
})
