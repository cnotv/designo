import { z } from 'zod'
import type { AuthSettings } from './types.ts'

export const AUTH_ENVIRONMENT_VARIABLE = 'DESIGNO_AUTH'

const GOOGLE_MODE = 'google'
const MINIMUM_SESSION_SECRET_LENGTH = 32
const DOMAIN_PATTERN = /^[\da-z]([\da-z-]*[\da-z])?(\.[\da-z]([\da-z-]*[\da-z])?)+$/

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')

const isAcceptablePublicUrl = (value: string): boolean => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  const isSecure = url.protocol === 'https:'
  const isLocalDevelopment = url.protocol === 'http:' && url.hostname === 'localhost'
  const isBareOrigin =
    url.pathname === '/' && url.search === '' && url.hash === '' && url.username === ''
  return (isSecure || isLocalDevelopment) && isBareOrigin
}

const publicUrlSchema = z
  .string()
  .refine(isAcceptablePublicUrl)
  .transform((value) => new URL(value).origin)

const requiredTextSchema = z.string().trim().min(1)
const emailListSchema = z.array(z.email())

// Keys are the environment variable names, so a failed check names the setting to fix.
const settingsSchema = z.object({
  DESIGNO_GOOGLE_CLIENT_ID: requiredTextSchema,
  DESIGNO_GOOGLE_CLIENT_SECRET: requiredTextSchema,
  DESIGNO_PUBLIC_URL: publicUrlSchema,
  DESIGNO_SESSION_SECRET: z.string().min(MINIMUM_SESSION_SECRET_LENGTH),
  DESIGNO_ADMIN_EMAILS: z.string().transform(splitList).pipe(emailListSchema.min(1)),
  DESIGNO_AUTO_APPROVE_EMAILS: z.string().default('').transform(splitList).pipe(emailListSchema),
  DESIGNO_AUTO_APPROVE_DOMAINS: z
    .string()
    .default('')
    .transform(splitList)
    .pipe(z.array(z.string().regex(DOMAIN_PATTERN)))
})

/**
 * Says whether sign-in is turned on. Anything but `google` or unset is a mistake worth stopping
 * for, since it would silently leave a server open that was meant to be closed.
 * @param environment - The process environment.
 * @returns True when `DESIGNO_AUTH=google`.
 */
export const isAuthEnabled = (environment: NodeJS.ProcessEnv): boolean => {
  const mode = environment[AUTH_ENVIRONMENT_VARIABLE]?.trim()
  if (mode === undefined || mode === '') return false
  if (mode === GOOGLE_MODE) return true
  throw new Error(`${AUTH_ENVIRONMENT_VARIABLE} must be "${GOOGLE_MODE}" or unset`)
}

/**
 * Reads every sign-in setting in one place. With sign-in off nothing is read.
 * The error names the settings that are missing or invalid and never their values.
 * @param environment - The process environment.
 * @returns The validated settings, or undefined when sign-in is off.
 */
export const loadAuthSettings = (environment: NodeJS.ProcessEnv): AuthSettings | undefined => {
  if (!isAuthEnabled(environment)) return undefined
  const parsed = settingsSchema.safeParse(environment)
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))]
    throw new Error(
      `${AUTH_ENVIRONMENT_VARIABLE}=${GOOGLE_MODE} needs these settings, which are missing or invalid: ${names.join(', ')}`
    )
  }
  const settings = parsed.data
  return {
    googleClientId: settings.DESIGNO_GOOGLE_CLIENT_ID,
    googleClientSecret: settings.DESIGNO_GOOGLE_CLIENT_SECRET,
    publicUrl: settings.DESIGNO_PUBLIC_URL,
    secureCookies: settings.DESIGNO_PUBLIC_URL.startsWith('https:'),
    sessionSecret: settings.DESIGNO_SESSION_SECRET,
    adminEmails: settings.DESIGNO_ADMIN_EMAILS,
    autoApproveEmails: settings.DESIGNO_AUTO_APPROVE_EMAILS,
    autoApproveDomains: settings.DESIGNO_AUTO_APPROVE_DOMAINS
  }
}
