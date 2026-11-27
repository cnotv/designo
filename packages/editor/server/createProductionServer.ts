import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  accountDirectory,
  createAccountStore,
  createAuthorizationCodeStore,
  createOAuthStore,
  createRateLimiter,
  createReplayGuard
} from '@designo/auth'
import { createSyncHub, type SyncHub } from '@designo/sync/server'
import { handleAdminRoute, isAdminRoute } from './adminRoutes.ts'
import { accountFromRequest, sendAccountRefusal } from './authentication.ts'
import { handleAuthRoute, ME_ROUTE } from './authRoutes.ts'
import { handleConnectionsRoute, isConnectionsRoute } from './connectionsRoutes.ts'
import { handleOAuthRoute } from './oauthRoutes.ts'
import { FILES_ROUTE, handleFilesRequest } from './filesApi.ts'
import { sendError, sendOk } from './http.ts'
import { handleSyncUpgrade, isSyncUpgrade } from './syncRoute.ts'
import type { AuthContext, ProductionServerOptions } from './types.ts'

const HTTP_INTERNAL_SERVER_ERROR = 500

// Registration and the token endpoint are open to anyone who can reach the server, so each
// remote address gets a bounded number of tries. Registering is rare; a refresh is hourly.
const MILLISECONDS_PER_MINUTE = 60_000
const RATE_LIMITED_ADDRESSES = 1000
const REGISTRATION_LIMIT = {
  limit: 30,
  windowMilliseconds: 10 * MILLISECONDS_PER_MINUTE,
  maxKeys: RATE_LIMITED_ADDRESSES
}
const TOKEN_LIMIT = {
  limit: 120,
  windowMilliseconds: MILLISECONDS_PER_MINUTE,
  maxKeys: RATE_LIMITED_ADDRESSES
}

const pathnameOf = (request: IncomingMessage): string => (request.url ?? '').split('?')[0] ?? ''

const isFilesRoute = (pathname: string): boolean =>
  pathname === FILES_ROUTE || pathname.startsWith(`${FILES_ROUTE}/`)

// The folder of the signed-in, approved account a request comes from; the live connection to a
// file is opened in it, as the files API is.
const accountDataDirectory = async (
  context: AuthContext,
  request: IncomingMessage
): Promise<string | undefined> => {
  const account = await accountFromRequest(context, request)
  return account?.status === 'approved'
    ? accountDirectory(context.dataDirectory, account.id)
    : undefined
}

// The files API works on one account's folder, so a signed-in, approved account is the only way in.
const handleAccountFiles = async (
  context: AuthContext,
  dataDirectory: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const account = await accountFromRequest(context, request)
  if (account?.status !== 'approved') {
    sendAccountRefusal(response, account)
    return
  }
  await handleFilesRequest(
    accountDirectory(dataDirectory, account.id),
    request,
    response,
    (request.url ?? '').slice(FILES_ROUTE.length),
    context.syncHub.applyOperations
  )
}

const answerInternalError = (error: unknown, response: ServerResponse): void => {
  console.error(`Request failed: ${error instanceof Error ? error.name : 'unknown error'}`)
  if (response.headersSent) {
    response.end()
    return
  }
  response.removeHeader('Set-Cookie')
  sendError(response, HTTP_INTERNAL_SERVER_ERROR, 'Internal error')
}

const routeWithSignIn = async (
  context: AuthContext,
  options: ProductionServerOptions,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const pathname = pathnameOf(request)
  if (await handleAuthRoute(context, request, response, pathname)) return
  if (await handleOAuthRoute(context, request, response, pathname)) return
  if (isAdminRoute(pathname)) {
    await handleAdminRoute(context, request, response, pathname)
    return
  }
  if (isConnectionsRoute(pathname)) {
    await handleConnectionsRoute(context, request, response, pathname)
    return
  }
  if (isFilesRoute(pathname)) {
    await handleAccountFiles(context, options.dataDirectory, request, response)
    return
  }
  options.serveStatic(request, response)
}

const routeWithoutSignIn = async (
  options: ProductionServerOptions,
  syncHub: SyncHub,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const pathname = pathnameOf(request)
  if (pathname === ME_ROUTE) {
    sendOk(response, { authEnabled: false })
    return
  }
  if (isFilesRoute(pathname)) {
    await handleFilesRequest(
      options.dataDirectory,
      request,
      response,
      (request.url ?? '').slice(FILES_ROUTE.length),
      syncHub.applyOperations
    )
    return
  }
  options.serveStatic(request, response)
}

/**
 * Builds the production HTTP server without starting it: the built editor, the files API and,
 * when settings and an identity provider are given, Google sign-in with files kept per account.
 * Without them it behaves as it always has, with no login and every file in the data folder.
 * Everything it depends on comes in through the options, so tests drive it with a fake provider.
 * @param options - Data folder, static file handler and, for sign-in, settings, provider, clock.
 * @returns The server, not yet listening.
 */
export const createProductionServer = (options: ProductionServerOptions): Server => {
  const clock = options.clock ?? Date.now
  const syncHub = options.syncHub ?? createSyncHub()
  const context: AuthContext | undefined = options.settings
    ? {
        settings: options.settings,
        identityProvider: options.identityProvider,
        accountStore: createAccountStore(options.dataDirectory),
        replayGuard: createReplayGuard(clock),
        clock,
        dataDirectory: options.dataDirectory,
        oauthStore: createOAuthStore(options.dataDirectory, clock),
        authorizationCodes: createAuthorizationCodeStore(clock),
        registrationLimiter: createRateLimiter(REGISTRATION_LIMIT, clock),
        tokenLimiter: createRateLimiter(TOKEN_LIMIT, clock),
        rasterize: options.rasterize,
        syncHub
      }
    : undefined
  const server = createServer((request, response) => {
    const answered = context
      ? routeWithSignIn(context, options, request, response)
      : routeWithoutSignIn(options, syncHub, request, response)
    answered.catch((error: unknown) => answerInternalError(error, response))
  })
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isSyncUpgrade(request)) {
      socket.destroy()
      return
    }
    const findDataDirectory = context
      ? (incoming: IncomingMessage) => accountDataDirectory(context, incoming)
      : () => Promise.resolve(options.dataDirectory)
    handleSyncUpgrade(syncHub, findDataDirectory, { request, socket, head }).catch(() =>
      socket.destroy()
    )
  })
  server.on('close', () => void syncHub.close())
  return server
}
