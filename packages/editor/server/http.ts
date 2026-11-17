import type { IncomingMessage, ServerResponse } from 'node:http'

const HTTP_OK = 200
const HTTP_NO_CONTENT = 204
const HTTP_FOUND = 302

/**
 * Answers with a JSON body that no cache may keep.
 * @param response - Where the answer goes.
 * @param status - The HTTP status.
 * @param body - Anything JSON-serialisable.
 */
export const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

/**
 * Answers with a JSON error.
 * @param response - Where the answer goes.
 * @param status - The HTTP status.
 * @param error - The message; never anything secret.
 */
export const sendError = (response: ServerResponse, status: number, error: string): void => {
  sendJson(response, status, { error })
}

/**
 * Answers 200 with a JSON body.
 * @param response - Where the answer goes.
 * @param body - Anything JSON-serialisable.
 */
export const sendOk = (response: ServerResponse, body: unknown): void => {
  sendJson(response, HTTP_OK, body)
}

/**
 * Answers 204 with no body.
 * @param response - Where the answer goes.
 */
export const sendNoContent = (response: ServerResponse): void => {
  response.statusCode = HTTP_NO_CONTENT
  response.setHeader('Cache-Control', 'no-store')
  response.end()
}

/**
 * Redirects the browser.
 * @param response - Where the answer goes.
 * @param location - Where to go.
 */
export const sendRedirect = (response: ServerResponse, location: string): void => {
  response.statusCode = HTTP_FOUND
  response.setHeader('Location', location)
  response.setHeader('Cache-Control', 'no-store')
  response.end()
}

/**
 * Says what is wrong with a request that names another site as its origin. A browser sends the
 * session cookie even with requests another site triggers, so a present Origin must be this host.
 * @param request - The incoming request.
 * @returns The problem, or undefined when the request may carry on.
 */
export const crossSiteProblem = (request: IncomingMessage): string | undefined => {
  const origin = request.headers.origin
  return origin && (!URL.canParse(origin) || new URL(origin).host !== request.headers.host)
    ? 'Cross-site requests are refused'
    : undefined
}
