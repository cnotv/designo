import { resolveDataDirectory } from '@designo/storage'
import type { Plugin } from 'vite'
import { FILES_ROUTE, handleFilesRequest } from './filesApi.ts'

/**
 * Serves the Designo files the MCP server writes, so the dev editor shows an agent's edits live.
 * The production server answers the same route with the same handler.
 * @returns The Vite plugin.
 */
export const designoFilesPlugin = (): Plugin => ({
  name: 'designo-files',
  configureServer: (server) => {
    const dataDirectory = resolveDataDirectory(process.env)
    // Connect strips the mount path, so the handler sees only what follows the route.
    server.middlewares.use(FILES_ROUTE, (request, response) => {
      void handleFilesRequest(dataDirectory, request, response, request.url ?? '')
    })
  }
})
