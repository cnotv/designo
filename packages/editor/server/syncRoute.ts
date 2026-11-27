import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { fileIdSchema, readDocumentStamp } from '@designo/storage'
import { SYNC_ROUTE, type SyncHub } from '@designo/sync/server'
import { crossSiteProblem } from './http.ts'

const SYNC_PREFIX = `${SYNC_ROUTE}/`

const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404

const STATUS_TEXT = {
  [HTTP_BAD_REQUEST]: 'Bad Request',
  [HTTP_UNAUTHORIZED]: 'Unauthorized',
  [HTTP_FORBIDDEN]: 'Forbidden',
  [HTTP_NOT_FOUND]: 'Not Found'
} as const

type RefusalStatus = keyof typeof STATUS_TEXT

const pathnameOf = (request: IncomingMessage): string => (request.url ?? '').split('?')[0] ?? ''

// An upgrade has no response object yet, so a refusal is written to the socket as plain HTTP.
const refuse = (socket: Duplex, status: RefusalStatus): void => {
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_TEXT[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
  )
}

const decodeFileId = (pathname: string): string | undefined => {
  try {
    const parsed = fileIdSchema.safeParse(decodeURIComponent(pathname.slice(SYNC_PREFIX.length)))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether an upgrade request asks for a file's live connection.
 * @param request - The upgrade request.
 * @returns True for a path under the sync route.
 */
export const isSyncUpgrade = (request: IncomingMessage): boolean =>
  pathnameOf(request).startsWith(SYNC_PREFIX)

/**
 * Opens a file's live connection for a request that may have it: same site, a known file, and
 * the folder of whoever is asking, as the files API decides it.
 * @param hub - The server's live rooms.
 * @param findDataDirectory - The folder the request may work in; undefined when it may not.
 * @param upgrade - The upgrade request, its socket and the first bytes after the headers.
 * @param upgrade.request - The upgrade request.
 * @param upgrade.socket - Its socket.
 * @param upgrade.head - The bytes already read after the headers.
 * @returns Resolves once the connection is handed to the hub or refused.
 */
export const handleSyncUpgrade = async (
  hub: SyncHub,
  findDataDirectory: (request: IncomingMessage) => Promise<string | undefined>,
  upgrade: { request: IncomingMessage; socket: Duplex; head: Buffer }
): Promise<void> => {
  const { request, socket, head } = upgrade
  if (crossSiteProblem(request)) return refuse(socket, HTTP_FORBIDDEN)
  const fileId = decodeFileId(pathnameOf(request))
  if (!fileId) return refuse(socket, HTTP_BAD_REQUEST)
  const dataDirectory = await findDataDirectory(request)
  if (!dataDirectory) return refuse(socket, HTTP_UNAUTHORIZED)
  if ((await readDocumentStamp(dataDirectory, fileId)) === undefined)
    return refuse(socket, HTTP_NOT_FOUND)
  hub.handleUpgrade(request, socket, head, { dataDirectory, fileId })
  return undefined
}
