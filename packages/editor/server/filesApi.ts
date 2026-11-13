import type { IncomingMessage, ServerResponse } from 'node:http'
import { text } from 'node:stream/consumers'
import {
  applyOperationsToFile,
  createShortId,
  fileIdSchema,
  listDocuments,
  operationBatchSchema,
  readDocument
} from '@designo/storage'
import { z } from 'zod'

export const FILES_ROUTE = '/api/files'

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CONFLICT = 409
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415
const MAX_BODY_BYTES = 1_048_576

const OPERATIONS_SUFFIX = '/operations'

const operationsBodySchema = z.object({ operations: operationBatchSchema })

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

const sendError = (response: ServerResponse, status: number, error: string): void =>
  sendJson(response, status, { error })

// On a public deploy the browser sends the basic-auth login with every request to the site,
// including ones another site triggers. Requiring JSON forces a CORS preflight, which this server
// never approves, and a present Origin header must name this host.
const crossSiteProblem = (
  request: IncomingMessage
): { status: number; message: string } | undefined => {
  if (!(request.headers['content-type'] ?? '').startsWith('application/json')) {
    return {
      status: HTTP_UNSUPPORTED_MEDIA_TYPE,
      message: 'Send the operations as application/json'
    }
  }
  const origin = request.headers.origin
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== request.headers.host)) {
    return { status: HTTP_FORBIDDEN, message: 'Cross-site requests are refused' }
  }
  return undefined
}

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const body = await text(request)
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new RangeError('Body too large')
  return JSON.parse(body)
}

const handleOperationsPost = async (
  dataDirectory: string,
  fileId: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const problem = crossSiteProblem(request)
  if (problem) {
    sendError(response, problem.status, problem.message)
    return
  }
  if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, 'Body too large')
    return
  }
  const body = await readJsonBody(request).catch((error: unknown) => error)
  if (body instanceof RangeError) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, body.message)
    return
  }
  const parsed = operationsBodySchema.safeParse(body)
  if (!parsed.success) {
    sendError(response, HTTP_BAD_REQUEST, z.prettifyError(parsed.error))
    return
  }
  const applied = await applyOperationsToFile(
    dataDirectory,
    fileId,
    parsed.data.operations,
    createShortId
  ).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
  if (applied instanceof Error) {
    const missing = 'code' in applied && applied.code === 'ENOENT'
    sendError(
      response,
      missing ? HTTP_NOT_FOUND : HTTP_CONFLICT,
      missing ? 'Unknown file' : applied.message
    )
    return
  }
  sendJson(response, HTTP_OK, applied)
}

const handleRead = async (
  dataDirectory: string,
  fileId: string,
  response: ServerResponse
): Promise<void> => {
  if (fileId === '') {
    sendJson(response, HTTP_OK, await listDocuments(dataDirectory))
    return
  }
  try {
    sendJson(response, HTTP_OK, await readDocument(dataDirectory, fileId))
  } catch {
    sendError(response, HTTP_NOT_FOUND, 'Unknown file')
  }
}

/**
 * Answers a request under the files route. GET lists files or reads one; POST to
 * `<file id>/operations` applies a batch of operations to that file.
 * @param dataDirectory - Where Designo files live.
 * @param request - The incoming request.
 * @param response - Where the JSON answer goes.
 * @param pathAfterRoute - The request path with the files route already removed.
 * @returns Resolves once the answer is sent.
 */
export const handleFilesRequest = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
  pathAfterRoute: string
): Promise<void> => {
  const path = (pathAfterRoute.split('?')[0] ?? '').replace(/^\/+/, '')
  const isOperations = path.endsWith(OPERATIONS_SUFFIX)
  const fileId = isOperations ? path.slice(0, -OPERATIONS_SUFFIX.length) : path
  if (fileId !== '' && !fileIdSchema.safeParse(fileId).success) {
    sendError(response, HTTP_NOT_FOUND, 'Unknown file')
    return
  }
  if (isOperations && request.method === 'POST') {
    await handleOperationsPost(dataDirectory, fileId, request, response)
    return
  }
  if (isOperations || request.method !== 'GET') {
    sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
    return
  }
  await handleRead(dataDirectory, fileId, response)
}
