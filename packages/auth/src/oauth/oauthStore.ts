import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Clock } from '../types.ts'
import { oauthFileSchema } from './schemas.ts'
import { createOpaqueToken, hashToken } from './tokens.ts'
import type {
  ConnectedAgent,
  IssuedTokens,
  NewClient,
  OAuthClient,
  OAuthGrant,
  OAuthStore,
  RefreshOutcome
} from './types.ts'

const OAUTH_FILE_NAME = 'oauth.json'
const OAUTH_FILE_FORMAT_VERSION = 1
// The file holds what lets agents act as people, even hashed, so only the server's user reads it.
const PRIVATE_FILE_MODE = 0o600

const MILLISECONDS_PER_SECOND = 1000
const MILLISECONDS_PER_HOUR = 3_600_000
const HOURS_PER_DAY = 24
const MILLISECONDS_PER_DAY = HOURS_PER_DAY * MILLISECONDS_PER_HOUR
const REFRESH_TOKEN_LIFETIME_DAYS = 30
const UNUSED_CLIENT_LIFETIME_DAYS = 90
export const ACCESS_TOKEN_LIFETIME_MILLISECONDS = MILLISECONDS_PER_HOUR
export const REFRESH_TOKEN_LIFETIME_MILLISECONDS =
  REFRESH_TOKEN_LIFETIME_DAYS * MILLISECONDS_PER_DAY
// A client without a live grant is forgotten after this long. It outlasts a refresh token, so an
// agent that comes back after a month is told its grant is invalid, not that nobody knows it.
const UNUSED_CLIENT_LIFETIME_MILLISECONDS = UNUSED_CLIENT_LIFETIME_DAYS * MILLISECONDS_PER_DAY
// A client that finds its access token expired often sends two requests at once, and both try
// to refresh. The second must get what the first got, not look like a stolen token, so a
// refresh token that was traded in a moment ago still answers with the same new pair.
export const REFRESH_RETRY_WINDOW_MILLISECONDS = 30_000
// Enough to recognise a copied token from the last few trades; older ones are just unknown.
const ROTATED_HASHES_KEPT = 5

export interface OAuthLimits {
  /** Registered clients kept; registration is open, so the file must not grow without bound. */
  maxClients: number
  maxGrants: number
  maxGrantsPerAccount: number
}

export const DEFAULT_OAUTH_LIMITS: OAuthLimits = {
  maxClients: 500,
  maxGrants: 1000,
  maxGrantsPerAccount: 20
}

interface OAuthState {
  clients: readonly OAuthClient[]
  grants: readonly OAuthGrant[]
}

export interface OAuthStoreOptions {
  limits?: OAuthLimits
  createToken?: () => string
  createId?: () => string
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

// Validated on every read: a damaged file must stop agents, not quietly forget who may act.
const readOAuthFile = async (filePath: string): Promise<OAuthState> => {
  const raw = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  if (raw === undefined) return { clients: [], grants: [] }
  const { clients, grants } = oauthFileSchema.parse(JSON.parse(raw))
  return { clients, grants }
}

const writeOAuthFile = async (filePath: string, state: OAuthState): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const contents = { formatVersion: OAUTH_FILE_FORMAT_VERSION, ...state }
  await writeFile(temporaryPath, `${JSON.stringify(contents, undefined, 2)}\n`, {
    encoding: 'utf8',
    mode: PRIVATE_FILE_MODE
  })
  await rename(temporaryPath, filePath)
}

const isGrantAlive = (grant: OAuthGrant, now: number): boolean => grant.refreshTokenExpiresAt > now

const hasGrant = (state: OAuthState, client: OAuthClient): boolean =>
  state.grants.some((grant) => grant.clientId === client.clientId)

// Returns the very same state when nothing is old enough to go, so no write follows.
const pruned = (state: OAuthState, now: number): OAuthState => {
  const grants = state.grants.filter((grant) => isGrantAlive(grant, now))
  const clients = state.clients.filter(
    (client) =>
      grants.some((grant) => grant.clientId === client.clientId) ||
      Date.parse(client.createdAt) + UNUSED_CLIENT_LIFETIME_MILLISECONDS > now
  )
  return grants.length === state.grants.length && clients.length === state.clients.length
    ? state
    : { clients, grants }
}

// Keeps the newest `limit` entries of a list that is in the order things were added.
const newest = <Item>(items: readonly Item[], limit: number): readonly Item[] =>
  items.length > limit ? items.slice(items.length - limit) : items

const limitGrants = (
  grants: readonly OAuthGrant[],
  accountId: string,
  limits: OAuthLimits
): readonly OAuthGrant[] => {
  const keptOfAccount = new Set(
    newest(
      grants.filter((grant) => grant.accountId === accountId),
      limits.maxGrantsPerAccount
    )
  )
  const withinAccountLimit = grants.filter(
    (grant) => grant.accountId !== accountId || keptOfAccount.has(grant)
  )
  return newest(withinAccountLimit, limits.maxGrants)
}

interface Randomness {
  createToken: () => string
  createId: () => string
}

const issueTokens = (random: Randomness, grantId: string, accountId: string, now: number) => {
  const accessToken = random.createToken()
  const refreshToken = random.createToken()
  const tokens: IssuedTokens = {
    grantId,
    accountId,
    accessToken,
    refreshToken,
    accessTokenLifetimeSeconds: ACCESS_TOKEN_LIFETIME_MILLISECONDS / MILLISECONDS_PER_SECOND
  }
  return {
    tokens,
    hashes: {
      accessTokenHash: hashToken(accessToken),
      accessTokenExpiresAt: now + ACCESS_TOKEN_LIFETIME_MILLISECONDS,
      refreshTokenHash: hashToken(refreshToken),
      refreshTokenExpiresAt: now + REFRESH_TOKEN_LIFETIME_MILLISECONDS
    }
  }
}

interface RecentRotation {
  tokens: IssuedTokens
  clientId: string
  at: number
}

// The earlier answer is repeated only while it is still the current pair of a grant that exists:
// a grant revoked in the meantime, or rotated again, gets nothing.
const repeatedRotation = (
  earlier: RecentRotation | undefined,
  state: OAuthState,
  now: number,
  clientId: string
): IssuedTokens | undefined => {
  const isCurrent =
    earlier !== undefined &&
    state.grants.some(
      (grant) =>
        grant.id === earlier.tokens.grantId &&
        grant.refreshTokenHash === hashToken(earlier.tokens.refreshToken)
    )
  return earlier &&
    isCurrent &&
    earlier.clientId === clientId &&
    now - earlier.at < REFRESH_RETRY_WINDOW_MILLISECONDS
    ? earlier.tokens
    : undefined
}

const withoutGrant = (state: OAuthState, grantId: string): OAuthState => ({
  ...state,
  grants: state.grants.filter((grant) => grant.id !== grantId)
})

const rotate = (
  random: Randomness,
  state: OAuthState,
  now: number,
  request: { refreshToken: string; clientId: string }
): { state: OAuthState; result: RefreshOutcome } => {
  const hash = hashToken(request.refreshToken)
  const current = state.grants.find((grant) => grant.refreshTokenHash === hash)
  const traded = state.grants.find((grant) => grant.rotatedRefreshTokenHashes.includes(hash))
  if (traded?.clientId === request.clientId) {
    return { state: withoutGrant(state, traded.id), result: { kind: 'reused' } }
  }
  if (!current || current.clientId !== request.clientId) {
    return { state, result: { kind: 'invalid' } }
  }
  const { tokens, hashes } = issueTokens(random, current.id, current.accountId, now)
  const rotated: OAuthGrant = {
    ...current,
    ...hashes,
    rotatedRefreshTokenHashes: newest(
      [...current.rotatedRefreshTokenHashes, current.refreshTokenHash],
      ROTATED_HASHES_KEPT
    )
  }
  return {
    state: { ...state, grants: state.grants.map((grant) => (grant === current ? rotated : grant)) },
    result: { kind: 'issued', tokens }
  }
}

const addGrant = (
  random: Randomness,
  state: OAuthState,
  now: number,
  input: { clientId: string; accountId: string },
  limits: OAuthLimits
): { state: OAuthState; result: IssuedTokens } => {
  const grantId = random.createId()
  const { tokens, hashes } = issueTokens(random, grantId, input.accountId, now)
  const grant: OAuthGrant = {
    id: grantId,
    clientId: input.clientId,
    accountId: input.accountId,
    createdAt: new Date(now).toISOString(),
    ...hashes,
    rotatedRefreshTokenHashes: []
  }
  return {
    state: { ...state, grants: limitGrants([...state.grants, grant], input.accountId, limits) },
    result: tokens
  }
}

// Forgets the answers older than the window and adds the one just given, if there was one.
const rememberRotation = (
  recent: ReadonlyMap<string, RecentRotation>,
  hash: string,
  clientId: string,
  outcome: RefreshOutcome,
  now: number
): ReadonlyMap<string, RecentRotation> => {
  const stillRecent = [...recent].filter(
    ([, earlier]) => now - earlier.at < REFRESH_RETRY_WINDOW_MILLISECONDS
  )
  const added: [string, RecentRotation][] =
    outcome.kind === 'issued' ? [[hash, { tokens: outcome.tokens, clientId, at: now }]] : []
  return new Map([...stillRecent, ...added])
}

// Clients nobody uses go first, oldest first; one with a grant is never evicted, so a flood of
// registrations cannot disconnect anyone. A store full of used clients says no.
const register = (
  random: Randomness,
  state: OAuthState,
  now: number,
  newClient: NewClient,
  limits: OAuthLimits
): { state: OAuthState; result: OAuthClient | undefined } => {
  const client: OAuthClient = {
    clientId: random.createId(),
    clientName: newClient.clientName,
    redirectUris: newClient.redirectUris,
    createdAt: new Date(now).toISOString()
  }
  const room = limits.maxClients - 1
  const unused = state.clients.filter((existing) => !hasGrant(state, existing))
  const evicted = new Set(unused.slice(0, Math.max(0, state.clients.length - room)))
  const kept = state.clients.filter((existing) => !evicted.has(existing))
  return kept.length > room
    ? { state, result: undefined }
    : { state: { ...state, clients: [...kept, client] }, result: client }
}

const grantLookup = (state: OAuthState, token: string, clientId: string | undefined) => {
  const hash = hashToken(token)
  return state.grants.find(
    (candidate) =>
      (candidate.accessTokenHash === hash || candidate.refreshTokenHash === hash) &&
      (clientId === undefined || candidate.clientId === clientId)
  )
}

const describeGrant = (grant: OAuthGrant, clients: readonly OAuthClient[]): ConnectedAgent => ({
  id: grant.id,
  clientName: clients.find((client) => client.clientId === grant.clientId)?.clientName ?? '',
  connectedAt: grant.createdAt,
  expiresAt: new Date(grant.refreshTokenExpiresAt).toISOString()
})

/**
 * Opens the OAuth store in the data folder: the clients that registered and the grants people
 * approved. Only token hashes are written. Reads are validated every time and writes go through
 * one queue and land atomically, like the account store's.
 * @param dataDirectory - Where Designo files live; the store is `oauth.json` inside it.
 * @param clock - The current time source, so tests control expiry.
 * @param options - Limits and the sources of randomness; tests replace them.
 * @returns The store.
 */
export const createOAuthStore = (
  dataDirectory: string,
  clock: Clock,
  options: OAuthStoreOptions = {}
): OAuthStore => {
  const filePath = path.join(dataDirectory, OAUTH_FILE_NAME)
  const limits = options.limits ?? DEFAULT_OAUTH_LIMITS
  const random: Randomness = {
    createToken: options.createToken ?? createOpaqueToken,
    createId: options.createId ?? randomUUID
  }
  // Settled writes are chained here, and a failed one must not block the next.
  let queueTail: Promise<unknown> = Promise.resolve()
  // The pairs handed out in the last few seconds, by the refresh token they replaced. Memory only,
  // and gone after the window: a token in the clear is never kept longer or written anywhere.
  let recentRotations: ReadonlyMap<string, RecentRotation> = new Map()

  const read = async (): Promise<OAuthState> => pruned(await readOAuthFile(filePath), clock())

  const modify = <Result>(
    change: (state: OAuthState, now: number) => { state: OAuthState; result: Result }
  ): Promise<Result> => {
    const run = queueTail.then(async () => {
      const now = clock()
      const stored = await readOAuthFile(filePath)
      const { state, result } = change(pruned(stored, now), now)
      // An unchanged state is the same object: a change that found nothing to do writes nothing.
      if (state !== stored) await writeOAuthFile(filePath, state)
      return result
    })
    queueTail = run.catch(() => undefined)
    return run
  }

  return {
    registerClient: (newClient) =>
      modify((state, now) => register(random, state, now, newClient, limits)),
    findClient: async (clientId) =>
      (await read()).clients.find((client) => client.clientId === clientId),
    createGrant: (input) => modify((state, now) => addGrant(random, state, now, input, limits)),
    rotateRefreshToken: (request) =>
      modify((state, now) => {
        const hash = hashToken(request.refreshToken)
        const repeated = repeatedRotation(recentRotations.get(hash), state, now, request.clientId)
        if (repeated) return { state, result: { kind: 'issued', tokens: repeated } }
        const outcome = rotate(random, state, now, request)
        recentRotations = rememberRotation(
          recentRotations,
          hash,
          request.clientId,
          outcome.result,
          now
        )
        return outcome
      }),
    authenticateAccessToken: async (accessToken) => {
      const hash = hashToken(accessToken)
      const now = clock()
      const grant = (await read()).grants.find(
        (candidate) => candidate.accessTokenHash === hash && candidate.accessTokenExpiresAt > now
      )
      return grant
        ? { grantId: grant.id, accountId: grant.accountId, clientId: grant.clientId }
        : undefined
    },
    authenticateRefreshToken: async ({ refreshToken, clientId }) => {
      const hash = hashToken(refreshToken)
      const grant = (await read()).grants.find(
        (candidate) => candidate.refreshTokenHash === hash && candidate.clientId === clientId
      )
      return grant ? { accountId: grant.accountId } : undefined
    },
    revokeToken: (token, clientId) =>
      modify((state) => {
        const grant = grantLookup(state, token, clientId)
        return { state: grant ? withoutGrant(state, grant.id) : state, result: undefined }
      }),
    revokeGrant: (grantId) =>
      modify((state) => ({ state: withoutGrant(state, grantId), result: undefined })),
    revokeAccountGrant: (accountId, grantId) =>
      modify((state) => {
        const isOwned = state.grants.some(
          (grant) => grant.id === grantId && grant.accountId === accountId
        )
        return { state: isOwned ? withoutGrant(state, grantId) : state, result: isOwned }
      }),
    listAccountGrants: async (accountId) => {
      const { clients, grants } = await read()
      return grants
        .filter((grant) => grant.accountId === accountId)
        .map((grant) => describeGrant(grant, clients))
    }
  }
}
