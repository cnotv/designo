import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { decideInitialStatus, decideStatusOnSignIn } from './approval.ts'
import { accountIdSchema, accountsFileSchema } from './schemas.ts'
import type { Account, AccountStore, ApprovalRules, VerifiedIdentity } from './types.ts'

const ACCOUNTS_FILE_NAME = 'accounts.json'
const ACCOUNTS_DIRECTORY_NAME = 'accounts'
const ACCOUNTS_FILE_FORMAT_VERSION = 1
// The file holds people's email addresses, so only the server's own user may read it.
const PRIVATE_FILE_MODE = 0o600

/**
 * Where one account's designs live. The id is validated, so it cannot leave the accounts folder.
 * @param dataDirectory - Where Designo files live.
 * @param accountId - The account's random id.
 * @returns The account's folder; it is created by the first write.
 */
export const accountDirectory = (dataDirectory: string, accountId: string): string =>
  path.join(dataDirectory, ACCOUNTS_DIRECTORY_NAME, accountIdSchema.parse(accountId))

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

// Validated on every read: a damaged accounts file must stop sign-in, not quietly drop accounts.
const readAccountsFile = async (filePath: string): Promise<readonly Account[]> => {
  const raw = await readFile(filePath, 'utf8').catch((error: unknown) => {
    if (isMissingFile(error)) return undefined
    throw error
  })
  return raw === undefined ? [] : accountsFileSchema.parse(JSON.parse(raw)).accounts
}

const writeAccountsFile = async (filePath: string, accounts: readonly Account[]): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const contents = { formatVersion: ACCOUNTS_FILE_FORMAT_VERSION, accounts }
  await writeFile(temporaryPath, `${JSON.stringify(contents, undefined, 2)}\n`, {
    encoding: 'utf8',
    mode: PRIVATE_FILE_MODE
  })
  await rename(temporaryPath, filePath)
}

const buildAccount = (
  identity: VerifiedIdentity,
  rules: ApprovalRules,
  now: number,
  accountId: string
): Account => ({
  id: accountId,
  subject: identity.subject,
  email: identity.email.toLowerCase(),
  emailVerified: identity.emailVerified,
  name: identity.name || identity.email,
  status: decideInitialStatus(identity, rules),
  createdAt: new Date(now).toISOString(),
  sessionEpoch: 0
})

// A later sign-in refreshes who the person is. Their status stays as an admin set it, except that
// an admin listed in the settings is approved again, so that list can never lock anyone out.
const refreshAccount = (
  account: Account,
  identity: VerifiedIdentity,
  rules: ApprovalRules
): Account => ({
  ...account,
  email: identity.email.toLowerCase(),
  emailVerified: identity.emailVerified,
  name: identity.name || identity.email,
  status: decideStatusOnSignIn(account.status, identity, rules.adminEmails)
})

/**
 * Opens the account store in the data folder. Reads are validated against the schema every time;
 * writes go through one queue and land atomically, so two sign-ins cannot lose each other's work.
 * @param dataDirectory - Where Designo files live; the store is `accounts.json` inside it.
 * @param createAccountId - Makes the random id of a new account.
 * @returns The store.
 */
export const createAccountStore = (
  dataDirectory: string,
  createAccountId: () => string = randomUUID
): AccountStore => {
  const filePath = path.join(dataDirectory, ACCOUNTS_FILE_NAME)
  // Settled writes are chained here, and a failed one must not block the next.
  let queueTail: Promise<unknown> = Promise.resolve()

  const list = (): Promise<readonly Account[]> => readAccountsFile(filePath)

  const modify = <Result>(
    change: (accounts: readonly Account[]) => { accounts: readonly Account[]; result: Result }
  ): Promise<Result> => {
    const run = queueTail.then(async () => {
      const { accounts, result } = change(await readAccountsFile(filePath))
      await writeAccountsFile(filePath, accounts)
      return result
    })
    queueTail = run.catch(() => undefined)
    return run
  }

  return {
    list,
    findById: async (accountId) => (await list()).find((account) => account.id === accountId),
    findByEmail: async (email) =>
      (await list()).filter((account) => account.email === email.toLowerCase()),
    signIn: (identity, rules, now) =>
      modify((accounts) => {
        const existing = accounts.find((account) => account.subject === identity.subject)
        if (existing) {
          const refreshed = refreshAccount(existing, identity, rules)
          return {
            accounts: accounts.map((account) => (account === existing ? refreshed : account)),
            result: refreshed
          }
        }
        const created = buildAccount(identity, rules, now, createAccountId())
        return { accounts: [...accounts, created], result: created }
      }),
    revokeSessions: (accountId) =>
      modify((accounts) => ({
        accounts: accounts.map((account) =>
          account.id === accountId
            ? { ...account, sessionEpoch: account.sessionEpoch + 1 }
            : account
        ),
        result: undefined
      }))
  }
}
