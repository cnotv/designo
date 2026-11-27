import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  applyOperationsToFile,
  createShortId,
  deleteDocument,
  fileIdSchema,
  listDocuments,
  operationBatchSchema,
  readDocument
} from '@designo/storage'
import { z } from 'zod'
import { handleAssetsRequest, isAssetsPath } from './assetsApi.ts'
import { handleFontsRequest, isFontsPath } from './fontsApi.ts'
import {
  MAX_BODY_BYTES,
  crossSiteProblem,
  jsonRequestProblem,
  readJsonBody,
  sendError,
  sendJson
} from './http.ts'

export const FILES_ROUTE = '/api/files'

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CONFLICT = 409
const HTTP_PAYLOAD_TOO_LARGE = 413

const OPERATIONS_SUFFIX = '/operations'

const operationsBodySchema = z.object({ operations: operationBatchSchema })

const handleOperationsPost = async (
  dataDirectory: string,
  fileId: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const problem = jsonRequestProblem(request)
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

const handleDelete = async (
  dataDirectory: string,
  fileId: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const crossSite = crossSiteProblem(request)
  if (crossSite) {
    sendError(response, HTTP_FORBIDDEN, crossSite)
    return
  }
  const failure = await deleteDocument(dataDirectory, fileId).then(
    () => undefined,
    () => true
  )
  if (failure) sendError(response, HTTP_NOT_FOUND, 'Unknown file')
  else sendJson(response, HTTP_OK, { deleted: fileId })
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

const routeFileRequest = async (
  dataDirectory: string,
  target: { fileId: string; isOperations: boolean },
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const { fileId, isOperations } = target
  if (isOperations && request.method === 'POST') {
    await handleOperationsPost(dataDirectory, fileId, request, response)
  } else if (!isOperations && fileId !== '' && request.method === 'DELETE') {
    await handleDelete(dataDirectory, fileId, request, response)
  } else if (isOperations || request.method !== 'GET') {
    sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
  } else {
    await handleRead(dataDirectory, fileId, response)
  }
}

/**
 * Answers a request under the files route. GET lists files or reads one; DELETE removes one; POST to
 * `<file id>/operations` applies a batch of operations to that file; `assets` stores and serves
 * pictures, and `fonts` the account's uploaded fonts.
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
  // `assets` is the picture store's path, so a file cannot be reached under that name.
  if (isAssetsPath(path)) {
    await handleAssetsRequest(dataDirectory, request, response, path)
    return
  }
  // Likewise `fonts` is the font store's.
  if (isFontsPath(path)) {
    await handleFontsRequest(dataDirectory, request, response, path)
    return
  }
  const isOperations = path.endsWith(OPERATIONS_SUFFIX)
  const fileId = isOperations ? path.slice(0, -OPERATIONS_SUFFIX.length) : path
  if (fileId !== '' && !fileIdSchema.safeParse(fileId).success) {
    sendError(response, HTTP_NOT_FOUND, 'Unknown file')
    return
  }
  await routeFileRequest(dataDirectory, { fileId, isOperations }, request, response)
}
