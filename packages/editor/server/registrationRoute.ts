import type { IncomingMessage, ServerResponse } from 'node:http'
import { redirectUrisProblem } from '@designo/auth'
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js'
import { z } from 'zod'
import { readJsonBody, sendJson } from './http.ts'
import {
  MAX_OAUTH_BODY_BYTES,
  rateLimitKey,
  sendBodyTooLarge,
  sendOAuthError,
  sendRateLimited
} from './oauthHttp.ts'
import { SUPPORTED_GRANT_TYPES, SUPPORTED_RESPONSE_TYPES } from './oauthMetadata.ts'
import type { AuthContext } from './types.ts'

const HTTP_CREATED = 201
const HTTP_BAD_REQUEST = 400
const HTTP_SERVICE_UNAVAILABLE = 503
const MILLISECONDS_PER_SECOND = 1000
const MAX_CLIENT_NAME_LENGTH = 100
const UNNAMED_CLIENT = 'An unnamed application'

const redirectUrisShapeSchema = z.object({ redirect_uris: z.array(z.string()) })

const isSubsetWithRequired = (
  given: readonly string[] | undefined,
  allowed: readonly string[],
  required: string
): boolean =>
  given === undefined || (given.includes(required) && given.every((item) => allowed.includes(item)))

// The name is shown on the consent page next to the person's own account, so it is cut down to
// plain text of a sensible length: no control or invisible formatting characters.
const cleanClientName = (name: string | undefined): string => {
  const cleaned = (name ?? '')
    .replaceAll(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CLIENT_NAME_LENGTH)
  return cleaned === '' ? UNNAMED_CLIENT : cleaned
}

type Registration =
  | { kind: 'refused'; error: string; description: string }
  | { kind: 'valid'; clientName: string; redirectUris: readonly string[] }

// Dynamic registration (RFC 7591) for public clients: there is no secret to hand out, and the
// redirect URIs are what a code can later be sent to, so they are checked hardest.
const validateRegistration = (body: unknown): Registration => {
  const shape = redirectUrisShapeSchema.safeParse(body)
  if (!shape.success) {
    return {
      kind: 'refused',
      error: 'invalid_client_metadata',
      description: 'redirect_uris must be a list of strings'
    }
  }
  const uriProblem = redirectUrisProblem(shape.data.redirect_uris)
  if (uriProblem) return { kind: 'refused', error: 'invalid_redirect_uri', description: uriProblem }
  const metadata = OAuthClientMetadataSchema.safeParse(body)
  if (!metadata.success) {
    return {
      kind: 'refused',
      error: 'invalid_client_metadata',
      description: 'The client metadata is not valid'
    }
  }
  const { token_endpoint_auth_method: method, grant_types, response_types } = metadata.data
  if (
    (method !== undefined && method !== 'none') ||
    !isSubsetWithRequired(grant_types, SUPPORTED_GRANT_TYPES, 'authorization_code') ||
    !isSubsetWithRequired(response_types, SUPPORTED_RESPONSE_TYPES, 'code')
  ) {
    return {
      kind: 'refused',
      error: 'invalid_client_metadata',
      description:
        'Only public clients are supported: token_endpoint_auth_method none, the authorization_code and refresh_token grants and the code response type'
    }
  }
  return {
    kind: 'valid',
    clientName: cleanClientName(metadata.data.client_name),
    redirectUris: shape.data.redirect_uris
  }
}

// Reads the body and says why it cannot be used, answering the request itself when it cannot.
const readRegistrationOrRefuse = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<Extract<Registration, { kind: 'valid' }> | undefined> => {
  if (!(request.headers['content-type'] ?? '').startsWith('application/json')) {
    sendOAuthError(response, HTTP_BAD_REQUEST, 'invalid_client_metadata', 'Send the body as JSON')
    return undefined
  }
  const body = await readJsonBody(request, MAX_OAUTH_BODY_BYTES).catch((error: unknown) => error)
  if (body instanceof RangeError) {
    sendBodyTooLarge(response)
    return undefined
  }
  const registration: Registration =
    body instanceof Error
      ? { kind: 'refused', error: 'invalid_client_metadata', description: 'The body is not JSON' }
      : validateRegistration(body)
  if (registration.kind === 'refused') {
    sendOAuthError(response, HTTP_BAD_REQUEST, registration.error, registration.description)
    return undefined
  }
  return registration
}

/**
 * Answers `POST /register`: a client announces itself and gets a client id. Open to anyone, so it
 * is rate limited and the store is capped.
 * @param context - The sign-in settings and the OAuth store.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @returns Resolves once the answer is sent.
 */
export const handleRegistration = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  if (!context.registrationLimiter.allow(rateLimitKey(request))) {
    sendRateLimited(response)
    return
  }
  const registration = await readRegistrationOrRefuse(request, response)
  if (!registration) return
  const client = await context.oauthStore.registerClient(registration)
  if (!client) {
    sendOAuthError(
      response,
      HTTP_SERVICE_UNAVAILABLE,
      'temporarily_unavailable',
      'No more clients can register right now'
    )
    return
  }
  const information: OAuthClientInformationFull = {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(Date.parse(client.createdAt) / MILLISECONDS_PER_SECOND),
    client_name: client.clientName,
    redirect_uris: [...client.redirectUris],
    token_endpoint_auth_method: 'none',
    grant_types: [...SUPPORTED_GRANT_TYPES],
    response_types: [...SUPPORTED_RESPONSE_TYPES]
  }
  sendJson(response, HTTP_CREATED, information)
}
