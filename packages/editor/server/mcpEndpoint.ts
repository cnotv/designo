import type { IncomingMessage, ServerResponse } from 'node:http'
import { accountDirectory, type Account } from '@designo/auth'
import { createShortId } from '@designo/storage'
import { MAX_BODY_BYTES, readJsonBody, sendJson } from './http.ts'
import { protectedResourceMetadataUrl } from './oauthMetadata.ts'
import type { AuthContext } from './types.ts'

const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_PAYLOAD_TOO_LARGE = 413

const JSON_RPC_PARSE_ERROR = -32_700
const JSON_RPC_INVALID_REQUEST = -32_600
const JSON_RPC_METHOD_NOT_ALLOWED = -32_000
const MAX_TOKEN_LENGTH = 512
const BEARER_PATTERN = /^bearer ([\w+./~-]+=*)$/i

// Loaded on the first agent request, not at start-up: the tools bring a native renderer and the
// MCP SDK with them, which a server with sign-in off, or one nobody connects an agent to, never needs.
const loadMcpRuntime = async () => {
  const [{ createDesignoServer }, { StreamableHTTPServerTransport }] = await Promise.all([
    import('@designo/mcp'),
    import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  ])
  return { createDesignoServer, StreamableHTTPServerTransport }
}

const sendRpcError = (
  response: ServerResponse,
  status: number,
  code: number,
  message: string
): void => {
  sendJson(response, status, { jsonrpc: '2.0', error: { code, message }, id: null })
}

const bearerToken = (request: IncomingMessage): string | undefined => {
  const token = BEARER_PATTERN.exec(request.headers.authorization ?? '')?.[1]
  return token !== undefined && token.length <= MAX_TOKEN_LENGTH ? token : undefined
}

// The challenge points an agent at the metadata that tells it where to sign in (RFC 9728).
const sendChallenge = (context: AuthContext, response: ServerResponse, hadToken: boolean): void => {
  const metadata = `resource_metadata="${protectedResourceMetadataUrl(context.settings)}"`
  response.setHeader(
    'WWW-Authenticate',
    hadToken ? `Bearer error="invalid_token", ${metadata}` : `Bearer ${metadata}`
  )
  sendJson(response, HTTP_UNAUTHORIZED, {
    error: hadToken ? 'invalid_token' : 'unauthorized',
    error_description: hadToken
      ? 'The access token is unknown, expired or revoked, or the account may not use Designo'
      : 'Send an access token as a Bearer token'
  })
}

// Read from the stores on every request, so blocking an account, or revoking a grant, cuts an
// agent off at once; the browser session plays no part, so signing out there changes nothing here.
const accountOfToken = async (
  context: AuthContext,
  token: string
): Promise<Account | undefined> => {
  const authenticated = await context.oauthStore.authenticateAccessToken(token)
  const account = authenticated
    ? await context.accountStore.findById(authenticated.accountId)
    : undefined
  return account?.status === 'approved' ? account : undefined
}

const readRequestBody = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<{ body: unknown } | undefined> => {
  const body = await readJsonBody(request, MAX_BODY_BYTES).catch((error: unknown) => error)
  if (body instanceof RangeError) {
    response.setHeader('Connection', 'close')
    sendRpcError(response, HTTP_PAYLOAD_TOO_LARGE, JSON_RPC_INVALID_REQUEST, 'Body too large')
    return undefined
  }
  if (body instanceof Error) {
    sendRpcError(response, HTTP_BAD_REQUEST, JSON_RPC_PARSE_ERROR, 'The body is not JSON')
    return undefined
  }
  return { body }
}

// Stateless: a server and a transport for this one request, with the tools pointed at the
// folder of the account the token belongs to and at nothing else. There is nothing to remember
// between requests, so any number of Designo processes could answer them.
const serveToolCall = async (
  account: Account,
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const parsed = await readRequestBody(request, response)
  if (!parsed) return
  const { createDesignoServer, StreamableHTTPServerTransport } = await loadMcpRuntime()
  const server = createDesignoServer({
    dataDirectory: accountDirectory(context.dataDirectory, account.id),
    generateId: createShortId
  })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })
  response.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(request, response, parsed.body)
}

/**
 * Answers `/mcp`, the remote MCP endpoint, for an agent that signed in with OAuth. Every call is
 * authenticated by its bearer token and works only in the folder of that token's account.
 * @param context - The sign-in settings, the stores and the data folder.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @returns Resolves once the answer is sent.
 */
export const handleMcp = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const token = bearerToken(request)
  const account = token ? await accountOfToken(context, token) : undefined
  if (!account) {
    sendChallenge(context, response, request.headers.authorization !== undefined)
    return
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendRpcError(
      response,
      HTTP_METHOD_NOT_ALLOWED,
      JSON_RPC_METHOD_NOT_ALLOWED,
      'This server answers POST requests only'
    )
    return
  }
  await serveToolCall(account, context, request, response)
}
