import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileIdSchema, listDocuments, readDocument, resolveDataDirectory } from '@designo/storage'
import type { Plugin } from 'vite'

const FILES_ROUTE = '/api/files'
const HTTP_NOT_FOUND = 404

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

const handleFilesRequest = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const requestedId = (request.url ?? '').replace(/^\/+/, '').split('?')[0] ?? ''
  if (requestedId === '') {
    sendJson(response, 200, await listDocuments(dataDirectory))
    return
  }
  if (!fileIdSchema.safeParse(requestedId).success) {
    sendJson(response, HTTP_NOT_FOUND, { error: 'Unknown file' })
    return
  }
  try {
    sendJson(response, 200, await readDocument(dataDirectory, requestedId))
  } catch {
    sendJson(response, HTTP_NOT_FOUND, { error: 'Unknown file' })
  }
}

/**
 * Serves the Designo files the MCP server writes, so the editor shows an agent's edits live.
 * Development only: the dev server is local; later the sync server package takes over.
 * @returns The Vite plugin.
 */
export const designoFilesPlugin = (): Plugin => ({
  name: 'designo-files',
  configureServer: (server) => {
    const dataDirectory = resolveDataDirectory(process.env)
    server.middlewares.use(FILES_ROUTE, (request, response) => {
      void handleFilesRequest(dataDirectory, request, response)
    })
  }
})
