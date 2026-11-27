import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { resolveDataDirectory } from '@designo/storage'
import { createSyncHub } from '@designo/sync/server'
import type { Plugin } from 'vite'
import { FILES_ROUTE, handleFilesRequest } from './filesApi.ts'
import { handleSyncUpgrade, isSyncUpgrade } from './syncRoute.ts'

/**
 * Serves the Designo files and their live connections, so the dev editor shows an agent's edits
 * live and two tabs edit together. The production server answers the same routes the same way.
 * @returns The Vite plugin.
 */
export const designoFilesPlugin = (): Plugin => ({
  name: 'designo-files',
  configureServer: (server) => {
    const dataDirectory = resolveDataDirectory(process.env)
    const syncHub = createSyncHub()
    // Connect strips the mount path, so the handler sees only what follows the route.
    server.middlewares.use(FILES_ROUTE, (request, response) => {
      void handleFilesRequest(
        dataDirectory,
        request,
        response,
        request.url ?? '',
        syncHub.applyOperations
      )
    })
    // Vite's own hot reload connects on the same server, so other upgrades are left to it.
    server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!isSyncUpgrade(request)) return
      handleSyncUpgrade(syncHub, () => Promise.resolve(dataDirectory), {
        request,
        socket,
        head
      }).catch(() => socket.destroy())
    })
    server.httpServer?.on('close', () => void syncHub.close())
  }
})
