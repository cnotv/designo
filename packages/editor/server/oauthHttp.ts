import type { IncomingMessage, ServerResponse } from 'node:http'
import { readLimitedText, sendJson } from './http.ts'

const HTTP_NO_CONTENT = 204
const HTTP_BAD_REQUEST = 400
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415
const HTTP_TOO_MANY_REQUESTS = 429

const PREFLIGHT_MAX_AGE_SECONDS = '600'
const RETRY_AFTER_SECONDS = '60'

// Forms and JSON sent to the open endpoints are tiny; this is far above what they need.
export const MAX_OAUTH_BODY_BYTES = 16_384

/**
 * Lets any web page call an open endpoint, which browser-based MCP clients such as the inspector
 * need. Only the endpoints that never read a cookie get this: they answer to a bearer token or to
 * nothing, so another site gains nothing by calling them. The sign-in and consent pages and the
 * `/api` routes, which do trust the cookie, never get it.
 * @param response - Where the answer goes.
 */
export const applyOpenCors = (response: ServerResponse): void => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID'
  )
  response.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id')
  response.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS)
}

/**
 * Answers a CORS preflight.
 * @param response - Where the answer goes, with the CORS headers already set.
 */
export const sendPreflightAnswer = (response: ServerResponse): void => {
  response.statusCode = HTTP_NO_CONTENT
  response.end()
}

/**
 * Answers with an RFC 6749 error: a JSON body with `error` and, when there is one, a description.
 * @param response - Where the answer goes.
 * @param status - The HTTP status.
 * @param error - The error code, such as `invalid_grant`.
 * @param description - A sentence for a developer; never anything secret.
 */
export const sendOAuthError = (
  response: ServerResponse,
  status: number,
  error: string,
  description?: string
): void => {
  response.setHeader('Pragma', 'no-cache')
  sendJson(response, status, {
    error,
    ...(description === undefined ? {} : { error_description: description })
  })
}

/**
 * Answers a request over its rate limit.
 * @param response - Where the answer goes.
 */
export const sendRateLimited = (response: ServerResponse): void => {
  response.setHeader('Retry-After', RETRY_AFTER_SECONDS)
  sendOAuthError(response, HTTP_TOO_MANY_REQUESTS, 'temporarily_unavailable', 'Too many requests')
}

/**
 * Answers a body that was refused for its size; the connection is closed so the rest of it is
 * not read.
 * @param response - Where the answer goes.
 */
export const sendBodyTooLarge = (response: ServerResponse): void => {
  response.setHeader('Connection', 'close')
  sendOAuthError(
    response,
    HTTP_PAYLOAD_TOO_LARGE,
    'invalid_request',
    'The request body is too large'
  )
}

/**
 * Reads a form body (`application/x-www-form-urlencoded`) and answers the request itself when
 * it cannot be used.
 * @param request - The incoming request.
 * @param response - Where a refusal goes.
 * @returns The form's fields, or undefined once a refusal has been sent.
 */
export const readFormOrRefuse = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<URLSearchParams | undefined> => {
  if (!(request.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded')) {
    sendOAuthError(
      response,
      HTTP_UNSUPPORTED_MEDIA_TYPE,
      'invalid_request',
      'Send the body as application/x-www-form-urlencoded'
    )
    return undefined
  }
  const body = await readLimitedText(request, MAX_OAUTH_BODY_BYTES)
  if (body === undefined) {
    sendBodyTooLarge(response)
    return undefined
  }
  return new URLSearchParams(body)
}

/**
 * Answers a request whose parameters are wrong in a way the sender can fix.
 * @param response - Where the answer goes.
 * @param description - What is wrong.
 */
export const sendInvalidRequest = (response: ServerResponse, description: string): void => {
  sendOAuthError(response, HTTP_BAD_REQUEST, 'invalid_request', description)
}

/**
 * Names the one remote address a request came from, for rate limiting. Behind a reverse proxy
 * that is the proxy's address, so the limit is then shared by everyone: the forwarded header is
 * not trusted, since anyone could set it to dodge the limit.
 * @param request - The incoming request.
 * @returns The address.
 */
export const rateLimitKey = (request: IncomingMessage): string =>
  request.socket.remoteAddress ?? 'unknown'
