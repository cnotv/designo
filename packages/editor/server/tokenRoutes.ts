import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  verifyCodeChallengeS256,
  type AuthorizationCodeDetails,
  type IssuedTokens,
  type OAuthClient
} from '@designo/auth'
import { sendJson, sendOk } from './http.ts'
import {
  rateLimitKey,
  readFormOrRefuse,
  sendInvalidRequest,
  sendOAuthError,
  sendRateLimited
} from './oauthHttp.ts'
import { mcpResourceUrl } from './oauthMetadata.ts'
import type { AuthContext } from './types.ts'

const HTTP_BAD_REQUEST = 400
const HTTP_OK = 200
const HTTP_METHOD_NOT_ALLOWED = 405

const sendInvalidGrant = (response: ServerResponse, description: string): void => {
  sendOAuthError(response, HTTP_BAD_REQUEST, 'invalid_grant', description)
}

// Tokens are the one thing here that must not linger in a browser or proxy cache (RFC 6749 5.1).
const sendTokens = (response: ServerResponse, tokens: IssuedTokens): void => {
  response.setHeader('Pragma', 'no-cache')
  sendJson(response, HTTP_OK, {
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.accessTokenLifetimeSeconds,
    refresh_token: tokens.refreshToken
  })
}

const single = (form: URLSearchParams, name: string): string | undefined => {
  const values = form.getAll(name)
  return values.length === 1 ? values[0] : undefined
}

const isWrongResource = (context: AuthContext, form: URLSearchParams): boolean => {
  const resource = single(form, 'resource')
  return (
    form.getAll('resource').length > 1 ||
    (resource !== undefined &&
      (!URL.canParse(resource) ||
        new URL(resource).href !== new URL(mcpResourceUrl(context.settings)).href))
  )
}

const findClientOrRefuse = async (
  context: AuthContext,
  form: URLSearchParams,
  response: ServerResponse
): Promise<OAuthClient | undefined> => {
  const clientId = single(form, 'client_id')
  const client = clientId ? await context.oauthStore.findClient(clientId) : undefined
  if (!client) sendOAuthError(response, HTTP_BAD_REQUEST, 'invalid_client', 'Unknown client_id')
  return client
}

// Everything a code was bound to when it was made has to be presented again, so a stolen code is
// useless to anyone who did not start the request: wrong client, wrong redirect URI or no
// verifier all fail the same way, and the code is spent by the attempt.
const codeMatches = (
  details: AuthorizationCodeDetails,
  client: OAuthClient,
  form: URLSearchParams
): boolean => {
  const verifier = single(form, 'code_verifier')
  return (
    details.clientId === client.clientId &&
    details.redirectUri === single(form, 'redirect_uri') &&
    verifier !== undefined &&
    verifyCodeChallengeS256(verifier, details.codeChallenge)
  )
}

// Turns a code into what it was bound to, or says it is no good. A code used twice means it was
// copied, so whatever its first use produced is revoked too.
const redeemCodeOrRefuse = async (
  context: AuthContext,
  code: string,
  client: OAuthClient,
  form: URLSearchParams,
  response: ServerResponse
): Promise<AuthorizationCodeDetails | undefined> => {
  const redemption = context.authorizationCodes.redeem(code)
  if (redemption.kind === 'replayed') {
    if (redemption.grantId) await context.oauthStore.revokeGrant(redemption.grantId)
    sendInvalidGrant(response, 'The authorization code is invalid or has been used')
    return undefined
  }
  if (redemption.kind === 'unknown' || !codeMatches(redemption.details, client, form)) {
    sendInvalidGrant(response, 'The authorization code is invalid or has expired')
    return undefined
  }
  return redemption.details
}

const exchangeCode = async (
  context: AuthContext,
  form: URLSearchParams,
  response: ServerResponse
): Promise<void> => {
  const client = await findClientOrRefuse(context, form, response)
  if (!client) return
  const code = single(form, 'code')
  if (code === undefined || single(form, 'code_verifier') === undefined) {
    sendInvalidRequest(response, 'code and code_verifier are required')
    return
  }
  if (isWrongResource(context, form)) {
    sendOAuthError(response, HTTP_BAD_REQUEST, 'invalid_target', 'Unknown resource')
    return
  }
  const details = await redeemCodeOrRefuse(context, code, client, form, response)
  if (!details) return
  const account = await context.accountStore.findById(details.accountId)
  if (account?.status !== 'approved') {
    sendInvalidGrant(response, 'The account may not use Designo')
    return
  }
  const tokens = await context.oauthStore.createGrant({
    clientId: client.clientId,
    accountId: account.id
  })
  context.authorizationCodes.recordGrant(code, tokens.grantId)
  sendTokens(response, tokens)
}

const refreshTokens = async (
  context: AuthContext,
  form: URLSearchParams,
  response: ServerResponse
): Promise<void> => {
  const client = await findClientOrRefuse(context, form, response)
  if (!client) return
  const refreshToken = single(form, 'refresh_token')
  if (refreshToken === undefined) {
    sendInvalidRequest(response, 'refresh_token is required')
    return
  }
  if (isWrongResource(context, form)) {
    sendOAuthError(response, HTTP_BAD_REQUEST, 'invalid_target', 'Unknown resource')
    return
  }
  const request = { refreshToken, clientId: client.clientId }
  const owner = await context.oauthStore.authenticateRefreshToken(request)
  // An account that may not act is turned away before the token is traded in, so the agent keeps
  // a refresh token that works again once the account does.
  const account = owner ? await context.accountStore.findById(owner.accountId) : undefined
  if (owner && account?.status !== 'approved') {
    sendInvalidGrant(response, 'The account may not use Designo')
    return
  }
  const outcome = await context.oauthStore.rotateRefreshToken(request)
  if (outcome.kind === 'issued') sendTokens(response, outcome.tokens)
  else sendInvalidGrant(response, 'The refresh token is invalid, expired or has been used')
}

/**
 * Answers `POST /token`: trades an authorization code, or a refresh token, for tokens. The
 * client is public, so what proves the request is the PKCE verifier or the refresh token itself.
 * @param context - The sign-in settings and the stores.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @returns Resolves once the answer is sent.
 */
export const handleToken = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendOAuthError(response, HTTP_METHOD_NOT_ALLOWED, 'invalid_request', 'Use POST')
    return
  }
  if (!context.tokenLimiter.allow(rateLimitKey(request))) {
    sendRateLimited(response)
    return
  }
  const form = await readFormOrRefuse(request, response)
  if (!form) return
  const grantType = single(form, 'grant_type')
  if (grantType === 'authorization_code') await exchangeCode(context, form, response)
  else if (grantType === 'refresh_token') await refreshTokens(context, form, response)
  else {
    sendOAuthError(
      response,
      HTTP_BAD_REQUEST,
      'unsupported_grant_type',
      'Use authorization_code or refresh_token'
    )
  }
}

/**
 * Answers `POST /revoke` (RFC 7009): ends the grant a token belongs to. Whether the token was
 * known is not told, so the endpoint cannot be used to test guesses.
 * @param context - The stores and the rate limiter.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @returns Resolves once the answer is sent.
 */
export const handleRevoke = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendOAuthError(response, HTTP_METHOD_NOT_ALLOWED, 'invalid_request', 'Use POST')
    return
  }
  if (!context.tokenLimiter.allow(rateLimitKey(request))) {
    sendRateLimited(response)
    return
  }
  const form = await readFormOrRefuse(request, response)
  if (!form) return
  const token = single(form, 'token')
  if (token === undefined) {
    sendInvalidRequest(response, 'token is required')
    return
  }
  await context.oauthStore.revokeToken(token, single(form, 'client_id'))
  sendOk(response, {})
}
