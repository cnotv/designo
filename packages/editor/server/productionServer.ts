import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDataDirectory } from '@designo/storage'
import sirv from 'sirv'
import { FILES_ROUTE, handleFilesRequest } from './filesApi.ts'

const DEFAULT_PORT = 3000
// Loopback by default: the files API has no authentication of its own, so exposing it is an
// explicit choice (HOST=0.0.0.0 in the container, behind Caddy's basic auth).
const DEFAULT_HOST = '127.0.0.1'

const distributionDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const dataDirectory = resolveDataDirectory(process.env)
const serveStatic = sirv(distributionDirectory, { single: true, etag: true, gzip: true })

const server = createServer((request, response) => {
  const pathname = request.url ?? ''
  if (pathname === FILES_ROUTE || pathname.startsWith(`${FILES_ROUTE}/`)) {
    void handleFilesRequest(dataDirectory, request, response, pathname.slice(FILES_ROUTE.length))
    return
  }
  serveStatic(request, response)
})

const port = Number(process.env.PORT ?? DEFAULT_PORT)
const host = process.env.HOST ?? DEFAULT_HOST

server.listen(port, host, () => {
  console.warn(`Designo on http://${host}:${port}, files in ${dataDirectory}`)
})
