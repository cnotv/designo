import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUTH_ENVIRONMENT_VARIABLE,
  createGoogleIdentityProvider,
  loadAuthSettings,
  type AuthSettings
} from '@designo/auth'
import { resolveDataDirectory } from '@designo/storage'
import sirv from 'sirv'
import { AUTH_CALLBACK_ROUTE } from './authRoutes.ts'
import { createProductionServer } from './createProductionServer.ts'

const DEFAULT_PORT = 3000
// Loopback by default: without sign-in the files API has no authentication of its own, so
// exposing it is an explicit choice (HOST=0.0.0.0 in the container, behind a reverse proxy).
const DEFAULT_HOST = '127.0.0.1'

const distributionDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

// A server meant to be closed must not start open: a bad setting stops it, naming the setting.
const loadSettingsOrExit = (): AuthSettings | undefined => {
  try {
    return loadAuthSettings(process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : `Invalid ${AUTH_ENVIRONMENT_VARIABLE}`)
    return process.exit(1)
  }
}

const settings = loadSettingsOrExit()
const dataDirectory = resolveDataDirectory(process.env)
const serveStatic = sirv(distributionDirectory, { single: true, etag: true, gzip: true })

const server = settings
  ? createProductionServer({
      dataDirectory,
      serveStatic,
      settings,
      identityProvider: createGoogleIdentityProvider({
        clientId: settings.googleClientId,
        clientSecret: settings.googleClientSecret,
        redirectUri: `${settings.publicUrl}${AUTH_CALLBACK_ROUTE}`
      })
    })
  : createProductionServer({ dataDirectory, serveStatic })

const port = Number(process.env.PORT ?? DEFAULT_PORT)
const host = process.env.HOST ?? DEFAULT_HOST

server.listen(port, host, () => {
  const signIn = settings ? ', sign-in with Google on' : ''
  console.warn(`Designo on http://${host}:${port}, files in ${dataDirectory}${signIn}`)
})
