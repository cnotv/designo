import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileIdSchema, listDocuments, readDocument } from '@designo/storage'

export const FILES_ROUTE = '/api/files'

const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

/**
 * Answers a read under the files route: the file list for the route itself, else one file by id.
 * @param dataDirectory - Where Designo files live.
 * @param pathAfterRoute - The request path with the files route already removed.
 * @param response - Where the JSON answer goes.
 * @returns Resolves once the answer is sent.
 */
export const handleFilesRequest = async (
  dataDirectory: string,
  pathAfterRoute: string,
  response: ServerResponse
): Promise<void> => {
  const requestedId = pathAfterRoute.replace(/^\/+/, '').split('?')[0] ?? ''
  if (requestedId === '') {
    sendJson(response, HTTP_OK, await listDocuments(dataDirectory))
    return
  }
  if (!fileIdSchema.safeParse(requestedId).success) {
    sendJson(response, HTTP_NOT_FOUND, { error: 'Unknown file' })
    return
  }
  try {
    sendJson(response, HTTP_OK, await readDocument(dataDirectory, requestedId))
  } catch {
    sendJson(response, HTTP_NOT_FOUND, { error: 'Unknown file' })
  }
}

/**
 * Reads the path of a request, without its query.
 * @param request - The incoming request.
 * @returns The path, or an empty string when the request has none.
 */
export const requestPath = (request: IncomingMessage): string => request.url ?? ''
