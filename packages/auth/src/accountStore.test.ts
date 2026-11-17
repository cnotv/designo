import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { accountDirectory, createAccountStore } from './accountStore.ts'
import type { ApprovalRules, VerifiedIdentity } from './types.ts'

const NOW = 1_700_000_000_000
const rules: ApprovalRules = {
  adminEmails: ['admin@example.com'],
  autoApproveEmails: [],
  autoApproveDomains: ['team.example.com']
}

const identity = (subject: string, email: string, overrides: Partial<VerifiedIdentity> = {}) => ({
  subject,
  email,
  emailVerified: true,
  name: `Name of ${subject}`,
  ...overrides
})

let dataDirectory: string

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-accounts-'))
})

afterEach(async () => {
  await rm(dataDirectory, { recursive: true, force: true })
})

describe('account store sign-in', () => {
  it('has no accounts before the first sign-in', async () => {
    expect(await createAccountStore(dataDirectory).list()).toEqual([])
  })

  it('creates a pending account for an unlisted address', async () => {
    const account = await createAccountStore(dataDirectory).signIn(
      identity('sub-1', 'Stranger@Example.com'),
      rules,
      NOW
    )
    expect(account).toMatchObject({
      subject: 'sub-1',
      email: 'stranger@example.com',
      status: 'pending',
      createdAt: new Date(NOW).toISOString()
    })
  })

  it('approves a verified admin and a verified address on a listed domain at once', async () => {
    const store = createAccountStore(dataDirectory)
    expect((await store.signIn(identity('a', 'admin@example.com'), rules, NOW)).status).toBe(
      'approved'
    )
    expect((await store.signIn(identity('b', 'x@team.example.com'), rules, NOW)).status).toBe(
      'approved'
    )
  })

  it('keeps an unverified address that matches a rule pending', async () => {
    const store = createAccountStore(dataDirectory)
    const account = await store.signIn(
      identity('a', 'admin@example.com', { emailVerified: false }),
      rules,
      NOW
    )
    expect(account).toMatchObject({ status: 'pending', emailVerified: false })
  })

  it('names the account with a random id, not the subject or the email', async () => {
    const store = createAccountStore(dataDirectory)
    const first = await store.signIn(identity('sub-1', 'one@example.com'), rules, NOW)
    const second = await store.signIn(identity('sub-2', 'two@example.com'), rules, NOW)
    expect(first.id).not.toBe(second.id)
    expect(first.id).not.toContain('sub-1')
    expect(first.id).not.toContain('example')
    expect(first.id).toMatch(/^[\w-]{20,64}$/)
  })

  it('updates email and name on a later sign-in but never the status', async () => {
    const store = createAccountStore(dataDirectory)
    const created = await store.signIn(identity('sub-1', 'old@example.com'), rules, NOW)
    const stored = JSON.parse(await readFile(path.join(dataDirectory, 'accounts.json'), 'utf8'))
    stored.accounts[0].status = 'blocked'
    await writeFile(path.join(dataDirectory, 'accounts.json'), JSON.stringify(stored))

    const again = await store.signIn(
      identity('sub-1', 'admin@example.com', { name: 'New Name' }),
      rules,
      NOW + 1000
    )
    expect(again).toMatchObject({
      id: created.id,
      email: 'admin@example.com',
      name: 'New Name',
      status: 'blocked',
      createdAt: created.createdAt
    })
    expect(await store.list()).toHaveLength(1)
  })

  it('falls back to the email when Google sends no name', async () => {
    const account = await createAccountStore(dataDirectory).signIn(
      identity('sub-1', 'one@example.com', { name: '' }),
      rules,
      NOW
    )
    expect(account.name).toBe('one@example.com')
  })

  it('does not lose accounts when sign-ins arrive together', async () => {
    const store = createAccountStore(dataDirectory)
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.signIn(identity(`sub-${index % 10}`, `p${index % 10}@example.com`), rules, NOW)
      )
    )
    expect(await store.list()).toHaveLength(10)
  })

  it('finds an account by id and by email in any letter case', async () => {
    const store = createAccountStore(dataDirectory)
    const account = await store.signIn(identity('sub-1', 'one@example.com'), rules, NOW)
    expect(await store.findById(account.id)).toEqual(account)
    expect(await store.findById('missing')).toBeUndefined()
    expect(await store.findByEmail('ONE@example.com')).toEqual([account])
    expect(await store.findByEmail('nobody@example.com')).toEqual([])
  })

  it('writes a file only its owner can read', async () => {
    await createAccountStore(dataDirectory).signIn(identity('a', 'one@example.com'), rules, NOW)
    const { mode } = await stat(path.join(dataDirectory, 'accounts.json'))
    expect(mode & 0o077).toBe(0)
  })
})

describe('account store validation', () => {
  it.each([
    ['not json', 'not json'],
    ['the wrong shape', JSON.stringify({ accounts: 'nope' })],
    [
      'an id that is not a safe folder name',
      JSON.stringify({
        formatVersion: 1,
        accounts: [
          {
            id: '../escape',
            subject: 's',
            email: 'a@example.com',
            emailVerified: true,
            name: 'A',
            status: 'approved',
            createdAt: 'now'
          }
        ]
      })
    ],
    [
      'an unknown status',
      JSON.stringify({
        formatVersion: 1,
        accounts: [
          {
            id: 'abc',
            subject: 's',
            email: 'a@example.com',
            emailVerified: true,
            name: 'A',
            status: 'superuser',
            createdAt: 'now'
          }
        ]
      })
    ]
  ])('refuses a file with %s rather than reading around it', async (_label, contents) => {
    await writeFile(path.join(dataDirectory, 'accounts.json'), contents)
    await expect(createAccountStore(dataDirectory).list()).rejects.toThrow()
  })
})

describe('accountDirectory', () => {
  it('is a folder named by the id inside accounts', () => {
    expect(accountDirectory('/data', 'abc-123')).toBe(path.join('/data', 'accounts', 'abc-123'))
  })

  it.each(['../other', 'a/b', '..', '', '/etc', 'a\\b', 'x'.repeat(65)])(
    'refuses the id %j',
    (accountId) => {
      expect(() => accountDirectory('/data', accountId)).toThrow()
    }
  )
})
