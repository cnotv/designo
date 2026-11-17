import type { IncomingMessage, ServerResponse } from 'node:http'
import { accountFromRequest, sendAccountRefusal } from './authentication.ts'
import { crossSiteProblem, sendError, sendNoContent, sendOk } from './http.ts'
import type { AuthContext } from './types.ts'

export const CONNECTIONS_ROUTE = '/api/connections'

const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405

// A grant's id is made by the server, so anything else is the same as an id that does not exist.
const GRANT_ID_PATTERN = /^[\w-]{1,64}$/

/**
 * Whether a path belongs to the connected-agents routes.
 * @param pathname - The request path without its query.
 * @returns True for the list route and the routes under it.
 */
export const isConnectionsRoute = (pathname: string): boolean =>
  pathname === CONNECTIONS_ROUTE || pathname.startsWith(`${CONNECTIONS_ROUTE}/`)

// An undecodable id cannot be one, so it is turned into text that never matches.
const decodeGrantId = (encoded: string): string => {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return ''
  }
}

const disconnectAgent = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string,
  grantId: string
): Promise<void> => {
  // The session cookie rides along with requests another site triggers, so a present Origin has
  // to be this site; a DELETE also needs a preflight that this server never approves.
  const problem = crossSiteProblem(request)
  if (problem) {
    sendError(response, HTTP_FORBIDDEN, problem)
    return
  }
  const wasRevoked =
    GRANT_ID_PATTERN.test(grantId) &&
    (await context.oauthStore.revokeAccountGrant(accountId, grantId))
  if (wasRevoked) sendNoContent(response)
  else sendError(response, HTTP_NOT_FOUND, 'No such agent')
}

/**
 * Answers the connected-agents routes: `GET /api/connections` lists the agents the signed-in
 * account has approved and `DELETE /api/connections/<id>` disconnects one. An account sees and
 * ends only its own, and a grant that is someone else's is the same 404 as one that is not there.
 * @param context - The sign-in settings and the stores.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @param pathname - The request path without its query.
 * @returns Resolves once the answer is sent.
 */
export const handleConnectionsRoute = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
): Promise<void> => {
  const account = await accountFromRequest(context, request)
  if (account?.status !== 'approved') {
    sendAccountRefusal(response, account)
    return
  }
  const grantId = pathname.slice(CONNECTIONS_ROUTE.length + 1)
  if (pathname === CONNECTIONS_ROUTE && request.method === 'GET') {
    sendOk(response, { connections: await context.oauthStore.listAccountGrants(account.id) })
  } else if (pathname !== CONNECTIONS_ROUTE && request.method === 'DELETE') {
    await disconnectAgent(context, request, response, account.id, decodeGrantId(grantId))
  } else {
    sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
  }
}
