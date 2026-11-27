import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_ASSET_BYTES, assetIdSchema, readAsset, writeAsset } from '@designo/storage'
import { crossSiteProblem, sendError, sendJson } from './http.ts'

const ASSETS_SEGMENT = 'assets'

/**
 * Says whether a path under the files route is the picture store's.
 * @param path - The request path after the files route, without slashes at the edges.
 * @returns True for `assets` and anything below it.
 */
export const isAssetsPath = (path: string): boolean =>
  path === ASSETS_SEGMENT || path.startsWith(`${ASSETS_SEGMENT}/`)

const HTTP_OK = 200
const HTTP_FORBIDDEN = 403
const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415
const ONE_YEAR_SECONDS = 31_536_000

/**
 * Reads a request body, giving up once it passes a size, so an upload cannot fill the memory.
 * @param request - The incoming request.
 * @param maxBytes - The most bytes accepted.
 * @returns The body; undefined when it is larger than allowed.
 */
export const readLimitedBytes = (
  request: IncomingMessage,
  maxBytes: number
): Promise<Uint8Array | undefined> =>
  new Promise((resolve, reject) => {
    if (Number(request.headers['content-length'] ?? 0) > maxBytes) {
      request.resume()
      resolve(undefined)
      return
    }
    let chunks: readonly Buffer[] = []
    let received = 0
    let isSettled = false
    request.on('data', (chunk: Buffer) => {
      if (isSettled) return
      received += chunk.length
      if (received > maxBytes) {
        isSettled = true
        chunks = []
        resolve(undefined)
        return
      }
      chunks = [...chunks, chunk]
    })
    request.on('end', () => {
      if (isSettled) return
      isSettled = true
      resolve(new Uint8Array(Buffer.concat(chunks)))
    })
    request.on('error', reject)
  })

const handleUpload = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  // An image content type is not one a form can send, so a page on another site cannot post here
  // without a preflight, which this server never approves.
  if (!(request.headers['content-type'] ?? '').startsWith('image/')) {
    sendError(response, HTTP_UNSUPPORTED_MEDIA_TYPE, 'Send the picture with an image content type')
    return
  }
  if (crossSiteProblem(request)) {
    sendError(response, HTTP_FORBIDDEN, 'Cross-site requests are refused')
    return
  }
  const bytes = await readLimitedBytes(request, MAX_ASSET_BYTES)
  if (!bytes) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, 'The picture is too large')
    return
  }
  try {
    sendJson(response, HTTP_OK, { assetId: await writeAsset(dataDirectory, bytes) })
  } catch (error) {
    sendError(response, HTTP_BAD_REQUEST, error instanceof Error ? error.message : 'Bad picture')
  }
}

const handleDownload = async (
  dataDirectory: string,
  assetId: string,
  response: ServerResponse
): Promise<void> => {
  if (!assetIdSchema.safeParse(assetId).success) {
    sendError(response, HTTP_NOT_FOUND, 'Unknown picture')
    return
  }
  try {
    const { bytes, mimeType } = await readAsset(dataDirectory, assetId)
    response.statusCode = HTTP_OK
    response.setHeader('Content-Type', mimeType)
    // The id is the hash of the bytes, so the answer never changes.
    response.setHeader('Cache-Control', `private, max-age=${ONE_YEAR_SECONDS}, immutable`)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(bytes)
  } catch {
    sendError(response, HTTP_NOT_FOUND, 'Unknown picture')
  }
}

/**
 * Answers a request under `/api/files/assets`: POST stores a picture and answers its id, GET
 * `assets/<id>` serves it.
 * @param dataDirectory - Where Designo files live.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @param path - The request path after the files route, without slashes at the edges.
 * @returns Resolves once the answer is sent.
 */
export const handleAssetsRequest = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
  path: string
): Promise<void> => {
  if (path === ASSETS_SEGMENT && request.method === 'POST') {
    await handleUpload(dataDirectory, request, response)
    return
  }
  if (path.startsWith(`${ASSETS_SEGMENT}/`) && request.method === 'GET') {
    await handleDownload(dataDirectory, path.slice(ASSETS_SEGMENT.length + 1), response)
    return
  }
  sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
}
