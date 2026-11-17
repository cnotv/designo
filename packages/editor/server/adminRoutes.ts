import type { IncomingMessage, ServerResponse } from 'node:http'
import { accountIdSchema, isAdminAccount, type Account } from '@designo/auth'
import { z } from 'zod'
import { accountFromRequest } from './authentication.ts'
import { MAX_BODY_BYTES, jsonRequestProblem, readJsonBody, sendError, sendOk } from './http.ts'
import type { AccountSummary, AuthContext } from './types.ts'

export const ADMIN_ROUTE = '/api/admin'
export const ADMIN_ACCOUNTS_ROUTE = `${ADMIN_ROUTE}/accounts`

const HTTP_BAD_REQUEST = 400
const HTTP_NOT_FOUND = 404
const HTTP_METHOD_NOT_ALLOWED = 405
const HTTP_CONFLICT = 409
const HTTP_PAYLOAD_TOO_LARGE = 413

const STATUS_SUFFIX = '/status'

// An admin approves, blocks or unblocks. `pending` is only where an account starts.
const statusBodySchema = z.strictObject({ status: z.enum(['approved', 'blocked']) })

/**
 * Whether a path belongs to the admin routes, the list and the status change alike.
 * @param pathname - The request path without its query.
 * @returns True for the admin route and everything under it.
 */
export const isAdminRoute = (pathname: string): boolean =>
  pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`)

// Only what the screen shows: never the Google subject, whether the email was verified, or the
// session epoch.
const summarize = (account: Account, adminEmails: readonly string[]): AccountSummary => ({
  id: account.id,
  email: account.email,
  name: account.name,
  status: account.status,
  createdAt: account.createdAt,
  isAdmin: isAdminAccount(account, adminEmails)
})

const accountIdInStatusPath = (pathname: string): string | undefined => {
  const prefix = `${ADMIN_ACCOUNTS_ROUTE}/`
  if (!pathname.startsWith(prefix) || !pathname.endsWith(STATUS_SUFFIX)) return undefined
  return pathname.slice(prefix.length, -STATUS_SUFFIX.length)
}

const sendNotFound = (response: ServerResponse): void => {
  sendError(response, HTTP_NOT_FOUND, 'Not found')
}

const listAccounts = async (context: AuthContext, response: ServerResponse): Promise<void> => {
  const accounts = await context.accountStore.list()
  sendOk(response, {
    accounts: accounts.map((account) => summarize(account, context.settings.adminEmails))
  })
}

const readStatusBody = async (
  request: IncomingMessage,
  response: ServerResponse
): Promise<z.infer<typeof statusBodySchema> | undefined> => {
  const problem = jsonRequestProblem(request)
  if (problem) {
    sendError(response, problem.status, problem.message)
    return undefined
  }
  const body = await readJsonBody(request).catch((error: unknown) => error)
  if (body instanceof RangeError) {
    sendError(response, HTTP_PAYLOAD_TOO_LARGE, `Body over ${MAX_BODY_BYTES} bytes`)
    return undefined
  }
  const parsed = body instanceof Error ? undefined : statusBodySchema.safeParse(body)
  if (!parsed?.success) {
    sendError(response, HTTP_BAD_REQUEST, 'Send {"status": "approved"} or {"status": "blocked"}')
    return undefined
  }
  return parsed.data
}

const changeStatus = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse,
  accountId: string
): Promise<void> => {
  const body = await readStatusBody(request, response)
  if (!body) return
  const target = await context.accountStore.findById(accountId)
  if (!target) {
    sendNotFound(response)
    return
  }
  // A listed admin is approved again at every sign-in, so a block would only last until then.
  // Taking someone's admin rights away means taking the address off the list; refusing here also
  // keeps the last admin, and an admin's own account, from being blocked by a click.
  if (body.status === 'blocked' && isAdminAccount(target, context.settings.adminEmails)) {
    sendError(
      response,
      HTTP_CONFLICT,
      'Admins cannot be blocked here: remove the address from DESIGNO_ADMIN_EMAILS'
    )
    return
  }
  const changed = await context.accountStore.setStatus(accountId, body.status)
  if (!changed) {
    sendNotFound(response)
    return
  }
  sendOk(response, summarize(changed, context.settings.adminEmails))
}

/**
 * Answers the admin routes: `GET /api/admin/accounts` lists accounts and
 * `POST /api/admin/accounts/<id>/status` approves, blocks or unblocks one. Anyone who is not a
 * signed-in, approved admin gets the same 404 as a path that does not exist, so the routes do
 * not show themselves to people who cannot use them.
 * @param context - The sign-in settings and the account store.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @param pathname - The request path without its query.
 * @returns Resolves once the answer is sent.
 */
export const handleAdminRoute = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
): Promise<void> => {
  const caller = await accountFromRequest(context, request)
  if (caller?.status !== 'approved' || !isAdminAccount(caller, context.settings.adminEmails)) {
    sendNotFound(response)
    return
  }
  const accountId = accountIdInStatusPath(pathname)
  if (pathname === ADMIN_ACCOUNTS_ROUTE) {
    if (request.method === 'GET') await listAccounts(context, response)
    else sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
    return
  }
  // An id that could not be one is the same as one that does not exist.
  if (accountId === undefined || !accountIdSchema.safeParse(accountId).success) {
    sendNotFound(response)
    return
  }
  if (request.method === 'POST') await changeStatus(context, request, response, accountId)
  else sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
}
