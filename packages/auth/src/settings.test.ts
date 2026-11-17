import { describe, expect, it } from 'vitest'
import { isAuthEnabled, loadAuthSettings } from './settings.ts'

const SESSION_SECRET = 'a-session-secret-that-is-long-enough-1234'
const CLIENT_SECRET = 'client-secret-value-that-must-not-leak'

const validEnvironment = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  DESIGNO_AUTH: 'google',
  DESIGNO_GOOGLE_CLIENT_ID: 'client-id.example.com',
  DESIGNO_GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
  DESIGNO_PUBLIC_URL: 'https://designo.example.com',
  DESIGNO_SESSION_SECRET: SESSION_SECRET,
  DESIGNO_ADMIN_EMAILS: 'Admin@Example.com, second@example.com',
  ...overrides
})

const messageOf = (environment: NodeJS.ProcessEnv): string => {
  try {
    loadAuthSettings(environment)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe('isAuthEnabled', () => {
  it('is off when the setting is unset or empty', () => {
    expect(isAuthEnabled({})).toBe(false)
    expect(isAuthEnabled({ DESIGNO_AUTH: '  ' })).toBe(false)
  })

  it('is on for google', () => {
    expect(isAuthEnabled({ DESIGNO_AUTH: 'google' })).toBe(true)
  })

  it('refuses any other value rather than leaving the server open', () => {
    expect(() => isAuthEnabled({ DESIGNO_AUTH: 'github' })).toThrow('DESIGNO_AUTH')
  })
})

describe('loadAuthSettings', () => {
  it('returns nothing and reads nothing else when sign-in is off', () => {
    expect(loadAuthSettings({})).toBeUndefined()
    expect(loadAuthSettings({ DESIGNO_SESSION_SECRET: 'short' })).toBeUndefined()
  })

  it('reads and normalises every setting', () => {
    const settings = loadAuthSettings(
      validEnvironment({
        DESIGNO_AUTO_APPROVE_EMAILS: 'Friend@Example.com',
        DESIGNO_AUTO_APPROVE_DOMAINS: 'Team.Example.com, example.org'
      })
    )
    expect(settings).toEqual({
      googleClientId: 'client-id.example.com',
      googleClientSecret: CLIENT_SECRET,
      publicUrl: 'https://designo.example.com',
      secureCookies: true,
      sessionSecret: SESSION_SECRET,
      adminEmails: ['admin@example.com', 'second@example.com'],
      autoApproveEmails: ['friend@example.com'],
      autoApproveDomains: ['team.example.com', 'example.org']
    })
  })

  it('treats the optional rules as empty when unset', () => {
    const settings = loadAuthSettings(validEnvironment())
    expect(settings?.autoApproveEmails).toEqual([])
    expect(settings?.autoApproveDomains).toEqual([])
  })

  it('accepts http only for localhost, with cookies that need no TLS', () => {
    const settings = loadAuthSettings(
      validEnvironment({ DESIGNO_PUBLIC_URL: 'http://localhost:5320/' })
    )
    expect(settings?.publicUrl).toBe('http://localhost:5320')
    expect(settings?.secureCookies).toBe(false)
  })

  it.each([
    'http://designo.example.com',
    'ftp://designo.example.com',
    'https://designo.example.com/app',
    'not a url'
  ])('refuses the public URL %s', (publicUrl) => {
    expect(messageOf(validEnvironment({ DESIGNO_PUBLIC_URL: publicUrl }))).toContain(
      'DESIGNO_PUBLIC_URL'
    )
  })

  it.each([
    'DESIGNO_GOOGLE_CLIENT_ID',
    'DESIGNO_GOOGLE_CLIENT_SECRET',
    'DESIGNO_PUBLIC_URL',
    'DESIGNO_SESSION_SECRET',
    'DESIGNO_ADMIN_EMAILS'
  ])('names %s when it is missing', (name) => {
    expect(messageOf(validEnvironment({ [name]: undefined }))).toContain(name)
  })

  it('refuses a session secret shorter than 32 characters', () => {
    expect(messageOf(validEnvironment({ DESIGNO_SESSION_SECRET: 'too-short' }))).toContain(
      'DESIGNO_SESSION_SECRET'
    )
  })

  it('refuses an invalid admin email, auto-approve email or domain', () => {
    expect(messageOf(validEnvironment({ DESIGNO_ADMIN_EMAILS: 'nobody' }))).toContain(
      'DESIGNO_ADMIN_EMAILS'
    )
    expect(messageOf(validEnvironment({ DESIGNO_AUTO_APPROVE_EMAILS: 'nobody' }))).toContain(
      'DESIGNO_AUTO_APPROVE_EMAILS'
    )
    expect(messageOf(validEnvironment({ DESIGNO_AUTO_APPROVE_DOMAINS: '@example.com' }))).toContain(
      'DESIGNO_AUTO_APPROVE_DOMAINS'
    )
  })

  it('never puts a value in the error', () => {
    const message = messageOf(
      validEnvironment({ DESIGNO_SESSION_SECRET: 'short-secret-value', DESIGNO_PUBLIC_URL: 'nope' })
    )
    expect(message).not.toContain('short-secret-value')
    expect(message).not.toContain(CLIENT_SECRET)
    expect(message).not.toContain('nope')
  })
})
