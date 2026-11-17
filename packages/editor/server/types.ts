import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  AccountStore,
  AuthSettings,
  Clock,
  IdentityProvider,
  ReplayGuard
} from '@designo/auth'

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void

interface ProductionServerBaseOptions {
  /** Where Designo files live; with sign-in on, each account gets a folder inside it. */
  dataDirectory: string
  /** Serves the built editor, which is public so the sign-in page can load. */
  serveStatic: RequestHandler
  clock?: Clock
}

interface SignInOffOptions {
  settings?: undefined
  identityProvider?: undefined
}

interface SignInOnOptions {
  settings: AuthSettings
  identityProvider: IdentityProvider
}

/** Sign-in is on when settings come with the provider that carries them out. */
export type ProductionServerOptions = ProductionServerBaseOptions &
  (SignInOffOptions | SignInOnOptions)

/** Everything the sign-in routes need, made once per server. */
export interface AuthContext {
  settings: AuthSettings
  identityProvider: IdentityProvider
  accountStore: AccountStore
  replayGuard: ReplayGuard
  clock: Clock
}
