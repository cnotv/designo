import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleAuthorize } from './authorizeRoute.ts'
import { handleMcp } from './mcpEndpoint.ts'
import { sendOk } from './http.ts'
import { applyOpenCors, sendOAuthError, sendPreflightAnswer } from './oauthHttp.ts'
import {
  AUTHORIZATION_SERVER_METADATA_ROUTE,
  AUTHORIZE_ROUTE,
  MCP_ROUTE,
  PROTECTED_RESOURCE_METADATA_ROUTE,
  REGISTER_ROUTE,
  REVOKE_ROUTE,
  TOKEN_ROUTE,
  authorizationServerMetadata,
  protectedResourceMetadata
} from './oauthMetadata.ts'
import { handleRegistration } from './registrationRoute.ts'
import { handleRevoke, handleToken } from './tokenRoutes.ts'
import type { AuthContext } from './types.ts'

const HTTP_METHOD_NOT_ALLOWED = 405

type RouteHandler = (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void>

const onlyGet =
  (answer: (context: AuthContext) => unknown): RouteHandler =>
  (context, request, response) => {
    if (request.method === 'GET') {
      sendOk(response, answer(context))
    } else {
      response.setHeader('Allow', 'GET, OPTIONS')
      sendOAuthError(response, HTTP_METHOD_NOT_ALLOWED, 'invalid_request', 'Use GET')
    }
    return Promise.resolve()
  }

const onlyPost =
  (handle: RouteHandler): RouteHandler =>
  (context, request, response) => {
    if (request.method === 'POST') return handle(context, request, response)
    response.setHeader('Allow', 'POST, OPTIONS')
    sendOAuthError(response, HTTP_METHOD_NOT_ALLOWED, 'invalid_request', 'Use POST')
    return Promise.resolve()
  }

const resourceMetadata = onlyGet((context) => protectedResourceMetadata(context.settings))

// These answer to a bearer token or to nobody, never to the session cookie, so any web page may
// call them: browser-based MCP clients need that. `/mcp` is the one that does real work, and it
// only ever reads the Authorization header. The authorize page and the `/api` routes are
// not in this table and send no CORS headers.
const openRoutes: Readonly<Record<string, RouteHandler>> = {
  [PROTECTED_RESOURCE_METADATA_ROUTE]: resourceMetadata,
  [`${PROTECTED_RESOURCE_METADATA_ROUTE}${MCP_ROUTE}`]: resourceMetadata,
  [AUTHORIZATION_SERVER_METADATA_ROUTE]: onlyGet((context) =>
    authorizationServerMetadata(context.settings)
  ),
  [REGISTER_ROUTE]: onlyPost(handleRegistration),
  [TOKEN_ROUTE]: handleToken,
  [REVOKE_ROUTE]: handleRevoke,
  [MCP_ROUTE]: handleMcp
}

/**
 * Answers the routes an agent uses to sign in: the metadata documents, registration, the
 * authorization page, the token and revocation endpoints. They exist only while sign-in is on.
 * @param context - The sign-in settings and the stores.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @param pathname - The request path without its query.
 * @returns True when the path was one of these routes and has been answered.
 */
export const handleOAuthRoute = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
): Promise<boolean> => {
  if (pathname === AUTHORIZE_ROUTE) {
    await handleAuthorize(context, request, response)
    return true
  }
  const handle = Object.hasOwn(openRoutes, pathname) ? openRoutes[pathname] : undefined
  if (!handle) return false
  applyOpenCors(response)
  if (request.method === 'OPTIONS') sendPreflightAnswer(response)
  else await handle(context, request, response)
  return true
}
