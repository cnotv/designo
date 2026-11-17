/** A program that registered itself to ask for access on someone's behalf. Always a public client. */
export interface OAuthClient {
  /** Random, made at registration. */
  clientId: string
  /** What the person sees on the consent page; chosen by the client, so never trusted as markup. */
  clientName: string
  /** Exact URIs the client may be sent back to: https, or http on a loopback address. */
  redirectUris: readonly string[]
  /** ISO 8601. */
  createdAt: string
}

/**
 * One approved connection between an account and a client. Tokens are never stored: only their
 * SHA-256 hashes, so a copy of the file cannot be used to act as anyone.
 */
export interface OAuthGrant {
  /** Random and public: it names the grant in the connected-agents list and is not a credential. */
  id: string
  clientId: string
  accountId: string
  /** ISO 8601. */
  createdAt: string
  accessTokenHash: string
  /** Epoch milliseconds. */
  accessTokenExpiresAt: number
  refreshTokenHash: string
  /** Epoch milliseconds. */
  refreshTokenExpiresAt: number
  /** The refresh tokens this grant has already traded in. Seeing one again means it was copied. */
  rotatedRefreshTokenHashes: readonly string[]
}

/** The only moment a token exists in the clear: right after it is made. */
export interface IssuedTokens {
  grantId: string
  accountId: string
  accessToken: string
  refreshToken: string
  accessTokenLifetimeSeconds: number
}

export interface AuthenticatedToken {
  grantId: string
  accountId: string
  clientId: string
}

export type RefreshOutcome =
  | { kind: 'issued'; tokens: IssuedTokens }
  /** Unknown, expired, or for another client. */
  | { kind: 'invalid' }
  /** An already-traded-in refresh token came back, so the whole grant was revoked. */
  | { kind: 'reused' }

/** One row of the connected-agents list. */
export interface ConnectedAgent {
  id: string
  clientName: string
  /** ISO 8601. */
  connectedAt: string
  /** ISO 8601: when the agent has to sign in again unless it keeps using its refresh token. */
  expiresAt: string
}

export interface NewClient {
  clientName: string
  redirectUris: readonly string[]
}

export interface OAuthStore {
  /**
   * Stores a client that registered itself.
   * @param client - Its display name and redirect URIs, already validated.
   * @returns The stored client, or undefined when the store is full of clients that are in use.
   */
  registerClient: (client: NewClient) => Promise<OAuthClient | undefined>
  findClient: (clientId: string) => Promise<OAuthClient | undefined>
  /**
   * Records an approval and makes its tokens. An account keeps a bounded number of grants: the
   * oldest is dropped to make room.
   * @param grant - Who approved which client.
   * @returns The tokens, in the clear for the last time.
   */
  createGrant: (grant: { clientId: string; accountId: string }) => Promise<IssuedTokens>
  /**
   * Trades a refresh token for a new pair. The old refresh token stops working; presenting it
   * again revokes the whole grant.
   * @param request - The refresh token and the client that presents it.
   * @returns What happened.
   */
  rotateRefreshToken: (request: {
    refreshToken: string
    clientId: string
  }) => Promise<RefreshOutcome>
  /**
   * Finds who an access token belongs to. Whether the account may still act is the caller's call.
   * @param accessToken - The bearer token from a request.
   * @returns The grant, or undefined when the token is unknown, expired or revoked.
   */
  authenticateAccessToken: (accessToken: string) => Promise<AuthenticatedToken | undefined>
  /**
   * Revokes the grant a token belongs to (RFC 7009). An unknown token is not an error.
   * @param token - An access or refresh token.
   * @param clientId - When given, the token only counts if it was issued to this client.
   * @returns Nothing.
   */
  revokeToken: (token: string, clientId?: string) => Promise<void>
  revokeGrant: (grantId: string) => Promise<void>
  /**
   * Revokes one grant, only if it belongs to the account.
   * @param accountId - The account asking.
   * @param grantId - The grant to end.
   * @returns False when the account has no such grant.
   */
  revokeAccountGrant: (accountId: string, grantId: string) => Promise<boolean>
  listAccountGrants: (accountId: string) => Promise<readonly ConnectedAgent[]>
}

export interface AuthorizationCodeDetails {
  clientId: string
  redirectUri: string
  /** The S256 challenge the token request must answer. */
  codeChallenge: string
  accountId: string
  /** The resource the person approved, when the request named one. */
  resource: string | undefined
}

export type CodeRedemption =
  | { kind: 'redeemed'; details: AuthorizationCodeDetails }
  | { kind: 'unknown' }
  /** The code was used before; `grantId` is what it produced, so the caller can revoke it. */
  | { kind: 'replayed'; grantId: string | undefined }

export interface AuthorizationCodeStore {
  /**
   * Makes a single-use code that lives for sixty seconds.
   * @param details - What the code is bound to.
   * @returns The code, in the clear; only its hash is kept.
   */
  issue: (details: AuthorizationCodeDetails) => string
  redeem: (code: string) => CodeRedemption
  /**
   * Remembers which grant a code produced, so a replay can undo it.
   * @param code - The redeemed code.
   * @param grantId - The grant it produced.
   * @returns Nothing.
   */
  recordGrant: (code: string, grantId: string) => void
}

export interface RateLimiter {
  /**
   * Counts one request against a key.
   * @param key - Who is asking, such as a remote address.
   * @returns False when the key is over its limit for the current window.
   */
  allow: (key: string) => boolean
}

export interface RateLimiterOptions {
  limit: number
  windowMilliseconds: number
  /** Keys remembered at once; the oldest is forgotten beyond this. */
  maxKeys: number
}
