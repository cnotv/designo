import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  accountDirectory,
  createAccountStore,
  type AccountStatus,
  type ApprovalRules
} from '@designo/auth'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveToolDirectory } from './accountDirectory.ts'
import { createFileTool, listFilesTool } from './tools.ts'

const NOW = 1_700_000_000_000
const rules: ApprovalRules = {
  adminEmails: ['admin@example.com'],
  autoApproveEmails: [],
  autoApproveDomains: []
}

let dataDirectory: string

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-mcp-account-'))
})

afterEach(async () => {
  await rm(dataDirectory, { recursive: true, force: true })
})

const signIn = (subject: string, email: string) =>
  createAccountStore(dataDirectory).signIn(
    { subject, email, emailVerified: true, name: subject },
    rules,
    NOW
  )

const signInWithStatus = async (email: string, status: AccountStatus) => {
  const account = await signIn(`sub-${email}`, email)
  // Only an admin changes a status, and that screen is a later step, so the test writes it.
  const store = createAccountStore(dataDirectory)
  await writeFile(
    path.join(dataDirectory, 'accounts.json'),
    JSON.stringify({
      formatVersion: 1,
      accounts: [...(await store.list()).map((entry) => ({ ...entry, status }))]
    })
  )
  return account
}

const authOn = { DESIGNO_AUTH: 'google', DESIGNO_ACCOUNT: 'admin@example.com' }

describe('the stdio server with sign-in off', () => {
  it('uses the data folder itself and ignores DESIGNO_ACCOUNT', async () => {
    expect(await resolveToolDirectory({}, dataDirectory)).toBe(dataDirectory)
    expect(
      await resolveToolDirectory({ DESIGNO_ACCOUNT: 'nobody@example.com' }, dataDirectory)
    ).toBe(dataDirectory)
  })
})

describe('the stdio server with sign-in on', () => {
  it('uses the folder of the approved account the email names, in any letter case', async () => {
    const account = await signIn('sub-1', 'admin@example.com')
    const expected = accountDirectory(dataDirectory, account.id)
    expect(await resolveToolDirectory(authOn, dataDirectory)).toBe(expected)
    expect(
      await resolveToolDirectory(
        { ...authOn, DESIGNO_ACCOUNT: ' Admin@Example.COM ' },
        dataDirectory
      )
    ).toBe(expected)
  })

  it('works on that account only: its files are not the root folder nor another account', async () => {
    await signIn('sub-1', 'admin@example.com')
    const other = await signIn('sub-2', 'other@example.com')
    const folder = await resolveToolDirectory(authOn, dataDirectory)
    const context = { dataDirectory: folder, generateId: (prefix: string) => `${prefix}-1` }
    await createFileTool(context, { name: 'Mine' })
    expect(await listFilesTool(context)).toHaveLength(1)
    expect(
      await listFilesTool({ ...context, dataDirectory: accountDirectory(dataDirectory, other.id) })
    ).toEqual([])
    expect(await listFilesTool({ ...context, dataDirectory })).toEqual([])
  })

  it('refuses to start without DESIGNO_ACCOUNT', async () => {
    await expect(resolveToolDirectory({ DESIGNO_AUTH: 'google' }, dataDirectory)).rejects.toThrow(
      'needs DESIGNO_ACCOUNT'
    )
    await expect(
      resolveToolDirectory({ DESIGNO_AUTH: 'google', DESIGNO_ACCOUNT: '  ' }, dataDirectory)
    ).rejects.toThrow('needs DESIGNO_ACCOUNT')
  })

  it('refuses an account that does not exist, and says to sign in once', async () => {
    await signIn('sub-1', 'other@example.com')
    await expect(resolveToolDirectory(authOn, dataDirectory)).rejects.toThrow(
      'There is no account for admin@example.com. Sign in to Designo once in the browser'
    )
  })

  it('refuses when there is no accounts file at all', async () => {
    await expect(resolveToolDirectory(authOn, dataDirectory)).rejects.toThrow('no account')
  })

  it('refuses a pending account', async () => {
    await signInWithStatus('admin@example.com', 'pending')
    await expect(resolveToolDirectory(authOn, dataDirectory)).rejects.toThrow(
      'waiting for approval'
    )
  })

  it('refuses a blocked account', async () => {
    await signInWithStatus('admin@example.com', 'blocked')
    await expect(resolveToolDirectory(authOn, dataDirectory)).rejects.toThrow('is blocked')
  })

  it('refuses an email shared by two approved accounts instead of guessing', async () => {
    await signIn('sub-1', 'admin@example.com')
    await signIn('sub-2', 'admin@example.com')
    await expect(resolveToolDirectory(authOn, dataDirectory)).rejects.toThrow(
      'More than one approved account'
    )
  })

  it('refuses a damaged accounts file rather than falling back to the data folder', async () => {
    await writeFile(path.join(dataDirectory, 'accounts.json'), 'not json')
    await expect(resolveToolDirectory(authOn, dataDirectory)).rejects.toThrow()
  })

  it('stops on a DESIGNO_AUTH value that is not google', async () => {
    await expect(resolveToolDirectory({ DESIGNO_AUTH: 'yes' }, dataDirectory)).rejects.toThrow(
      'must be "google" or unset'
    )
  })
})
