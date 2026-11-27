import type { IncomingMessage, ServerResponse } from 'node:http'
import { createDocument } from '@designo/core'
import type { SyncHub } from '@designo/sync/server'
import {
  createShortId,
  deleteDocument,
  fileIdSchema,
  listDocuments,
  operationBatchSchema,
  readDocument,
  writeDocument
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
const HTTP_CREATED = 201
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CONFLICT = 409
const HTTP_PAYLOAD_TOO_LARGE = 413

const OPERATIONS_SUFFIX = '/operations'

const operationsBodySchema = z.object({ operations: operationBatchSchema })
const newFileBodySchema = z.object({ name: z.string().trim().min(1).max(200) })

// Reads a state-changing JSON body and checks it; on a problem it answers and returns undefined.
const readValidatedBody = async <Schema extends z.ZodType>(
  request: IncomingMessage,
  response: ServerResponse,
  schema: Schema
): Promise<z.infer<Schema> | undefined> => {
  const problem = jsonRequestProblem(request)
  if (problem) {
    sendError(response, problem.status, problem.message)
    return undefined
  }
  if (Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, 'Body too large')
    return undefined
  }
  const body = await readJsonBody(request).catch((error: unknown) => error)
  if (body instanceof RangeError) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, body.message)
    return undefined
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    sendError(response, HTTP_BAD_REQUEST, z.prettifyError(parsed.error))
    return undefined
  }
  return parsed.data
}

const handleCreate = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const body = await readValidatedBody(request, response, newFileBodySchema)
  if (!body) return
  const fileId = createShortId('file')
  const pageId = createShortId('page')
  await writeDocument(dataDirectory, createDocument(fileId, body.name, pageId))
  sendJson(response, HTTP_CREATED, { fileId, pageId })
}

/** Applies a batch to a file: through its live room when it is open, else to the file itself. */
export type ApplyBatch = SyncHub['applyOperations']

const handleOperationsPost = async (
  dataDirectory: string,
  target: { fileId: string; applyBatch: ApplyBatch },
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const body = await readValidatedBody(request, response, operationsBodySchema)
  if (!body) return
  const applied = await target
    .applyBatch(dataDirectory, target.fileId, body.operations, createShortId)
    .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
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

type FileRequestTarget = { fileId: string; isOperations: boolean; applyBatch: ApplyBatch }

type FileRequestHandler = (
  dataDirectory: string,
  target: FileRequestTarget,
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void>

const readFile: FileRequestHandler = (dataDirectory, target, _request, response) =>
  handleRead(dataDirectory, target.fileId, response)

// Keyed by what the path names, then the method; anything else is refused with 405.
const fileRequestHandlers: Record<
  'list' | 'file' | 'operations',
  Record<string, FileRequestHandler>
> = {
  list: {
    GET: readFile,
    POST: (dataDirectory, _target, request, response) =>
      handleCreate(dataDirectory, request, response)
  },
  file: {
    GET: readFile,
    DELETE: (dataDirectory, target, request, response) =>
      handleDelete(dataDirectory, target.fileId, request, response)
  },
  operations: { POST: handleOperationsPost }
}

const routeFileRequest = async (
  dataDirectory: string,
  target: FileRequestTarget,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const { fileId, isOperations } = target
  const pathKind = isOperations ? 'operations' : fileId === '' ? 'list' : 'file'
  const handler = fileRequestHandlers[pathKind][request.method ?? '']
  if (handler) await handler(dataDirectory, target, request, response)
  else sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
}

/**
 * Answers a request under the files route. GET lists files or reads one; POST to the route itself
 * creates an empty file with one page; DELETE removes one; POST to
 * `<file id>/operations` applies a batch of operations to that file; `assets` stores and serves
 * pictures, and `fonts` the account's uploaded fonts.
 * @param dataDirectory - Where Designo files live.
 * @param request - The incoming request.
 * @param response - Where the JSON answer goes.
 * @param pathAfterRoute - The request path with the files route already removed.
 * @param applyBatch - How a batch of operations reaches the file: the sync hub's, so the people
 *   who have the file open see it at once.
 * @returns Resolves once the answer is sent.
 */
export const handleFilesRequest = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
  pathAfterRoute: string,
  applyBatch: ApplyBatch
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
  await routeFileRequest(dataDirectory, { fileId, isOperations, applyBatch }, request, response)
}
