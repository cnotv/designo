import type { IncomingMessage, ServerResponse } from 'node:http'
import { listUploadedFonts, storeUploadedFont } from '@designo/mcp'
import { MAX_FONT_BYTES, fontIdSchema, readFontFile } from '@designo/storage'
import { readLimitedBytes } from './assetsApi.ts'
import { crossSiteProblem, sendError, sendJson } from './http.ts'

const FONTS_SEGMENT = 'fonts'

/**
 * Says whether a path under the files route is the font store's.
 * @param path - The request path after the files route, without slashes at the edges.
 * @returns True for `fonts` and anything below it.
 */
export const isFontsPath = (path: string): boolean =>
  path === FONTS_SEGMENT || path.startsWith(`${FONTS_SEGMENT}/`)

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_PAYLOAD_TOO_LARGE = 413
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415
const ONE_YEAR_SECONDS = 31_536_000

// The registered font types and the generic one browsers give a file with an unknown type. None is
// a type a form can send, so a page on another site cannot post here without a preflight.
const FONT_CONTENT_TYPES = ['font/', 'application/octet-stream']

const handleUpload = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const contentType = request.headers['content-type'] ?? ''
  if (!FONT_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
    sendError(response, HTTP_UNSUPPORTED_MEDIA_TYPE, 'Send the font with a font content type')
    return
  }
  if (crossSiteProblem(request)) {
    sendError(response, HTTP_FORBIDDEN, 'Cross-site requests are refused')
    return
  }
  const bytes = await readLimitedBytes(request, MAX_FONT_BYTES)
  if (!bytes) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, 'The font is too large')
    return
  }
  try {
    sendJson(response, HTTP_OK, await storeUploadedFont(dataDirectory, bytes))
  } catch (error) {
    sendError(response, HTTP_BAD_REQUEST, error instanceof Error ? error.message : 'Bad font')
  }
}

const handleDownload = async (
  dataDirectory: string,
  fontId: string,
  response: ServerResponse
): Promise<void> => {
  if (!fontIdSchema.safeParse(fontId).success) {
    sendError(response, HTTP_NOT_FOUND, 'Unknown font')
    return
  }
  try {
    const bytes = await readFontFile(dataDirectory, fontId)
    response.statusCode = HTTP_OK
    response.setHeader('Content-Type', fontId.endsWith('.otf') ? 'font/otf' : 'font/ttf')
    // The id is the hash of the bytes, so the answer never changes.
    response.setHeader('Cache-Control', `private, max-age=${ONE_YEAR_SECONDS}, immutable`)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(bytes)
  } catch {
    sendError(response, HTTP_NOT_FOUND, 'Unknown font')
  }
}

/**
 * Answers a request under `/api/files/fonts`: GET lists the account's fonts, POST stores one and
 * answers it as listed, GET `fonts/<id>` serves its file.
 * @param dataDirectory - The account's folder.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @param path - The request path after the files route, without slashes at the edges.
 * @returns Resolves once the answer is sent.
 */
export const handleFontsRequest = async (
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse,
  path: string
): Promise<void> => {
  if (path === FONTS_SEGMENT && request.method === 'GET') {
    sendJson(response, HTTP_OK, await listUploadedFonts(dataDirectory))
    return
  }
  if (path === FONTS_SEGMENT && request.method === 'POST') {
    await handleUpload(dataDirectory, request, response)
    return
  }
  if (path.startsWith(`${FONTS_SEGMENT}/`) && request.method === 'GET') {
    await handleDownload(dataDirectory, path.slice(FONTS_SEGMENT.length + 1), response)
    return
  }
  sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
}
