import { z } from 'zod'
import type { AccountAction, AccountActionButton, AccountStatus, AccountSummary } from './types.ts'

export const ADMIN_ACCOUNTS_ROUTE = '/api/admin/accounts'

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404

const accountSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'approved', 'blocked']),
  createdAt: z.string(),
  isAdmin: z.boolean()
})

const accountListSchema = z.object({ accounts: z.array(accountSummarySchema) })

/**
 * Names the route that changes one account's status.
 * @param accountId - The account's id, which is encoded so it cannot add a path segment.
 * @returns The route.
 */
export const accountStatusRoute = (accountId: string): string =>
  `${ADMIN_ACCOUNTS_ROUTE}/${encodeURIComponent(accountId)}/status`

/**
 * Reads the answer to "list the accounts". Anything that is not clearly a list is no list, never
 * an error to show raw.
 * @param status - The HTTP status of the answer.
 * @param body - The parsed JSON body, or undefined when there was none.
 * @returns The accounts, or undefined when the answer is not a list.
 */
export const readAccountList = (
  status: number,
  body: unknown
): readonly AccountSummary[] | undefined => {
  const parsed = accountListSchema.safeParse(body)
  return status === HTTP_OK && parsed.success ? parsed.data.accounts : undefined
}

/**
 * Reads the answer to a status change.
 * @param status - The HTTP status of the answer.
 * @param body - The parsed JSON body, or undefined when there was none.
 * @returns The account as the server now has it, or undefined when the change was refused.
 */
export const readChangedAccount = (status: number, body: unknown): AccountSummary | undefined => {
  const parsed = accountSummarySchema.safeParse(body)
  return status === HTTP_OK && parsed.success ? parsed.data : undefined
}

/**
 * Says whether an answer means the visitor can no longer manage accounts: they signed out, lost
 * access, or are not an admin any more. The server answers a non-admin with 404.
 * @param status - The HTTP status of the answer.
 * @returns True for 401, 403 and 404.
 */
export const isAdminRefusal = (status: number): boolean =>
  status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN || status === HTTP_NOT_FOUND

const APPROVE_BUTTON: AccountActionButton = {
  action: 'approve',
  label: 'Approve',
  variant: 'outline'
}
const BLOCK_BUTTON: AccountActionButton = {
  action: 'block',
  label: 'Block',
  variant: 'destructive'
}
const UNBLOCK_BUTTON: AccountActionButton = {
  action: 'unblock',
  label: 'Unblock',
  variant: 'outline'
}

/**
 * Lists what an admin can do with an account. Admins are never offered Block: the server keeps
 * them approved, because the settings list, not this screen, decides who is one.
 * @param account - The account of one row.
 * @returns The buttons to show, in order.
 */
export const actionsForAccount = (account: AccountSummary): readonly AccountActionButton[] => {
  if (account.status === 'blocked') return [UNBLOCK_BUTTON]
  const block = account.isAdmin ? [] : [BLOCK_BUTTON]
  return account.status === 'pending' ? [APPROVE_BUTTON, ...block] : block
}

/**
 * Says which status an action asks the server for. Unblocking is approving again.
 * @param action - What the admin chose.
 * @returns The status to send.
 */
export const statusAfterAction = (action: AccountAction): Exclude<AccountStatus, 'pending'> =>
  action === 'block' ? 'blocked' : 'approved'

const BADGE_VARIANTS: Readonly<Record<AccountStatus, 'default' | 'secondary' | 'destructive'>> = {
  approved: 'default',
  pending: 'secondary',
  blocked: 'destructive'
}

/**
 * Picks the Badge look of a status.
 * @param status - The account's status.
 * @returns A shadcn-vue Badge variant.
 */
export const statusBadgeVariant = (
  status: AccountStatus
): 'default' | 'secondary' | 'destructive' => BADGE_VARIANTS[status]

/**
 * Orders accounts so the ones that need a decision come first, each group oldest first.
 * @param accounts - The accounts as listed.
 * @returns A new list; the given one is untouched.
 */
export const sortAccountsForReview = (
  accounts: readonly AccountSummary[]
): readonly AccountSummary[] =>
  [...accounts].sort(
    (first, second) =>
      Number(second.status === 'pending') - Number(first.status === 'pending') ||
      first.createdAt.localeCompare(second.createdAt)
  )

/**
 * Counts the accounts waiting for a decision.
 * @param accounts - The accounts as listed.
 * @returns How many are pending.
 */
export const countPendingAccounts = (accounts: readonly AccountSummary[]): number =>
  accounts.filter((account) => account.status === 'pending').length

const DAY_LENGTH = 'YYYY-MM-DD'.length

/**
 * Formats when an account was made. UTC, so every admin reads the same date.
 * @param createdAt - An ISO 8601 date.
 * @returns `YYYY-MM-DD`, or a dash when the date cannot be read.
 */
export const formatJoinedDate = (createdAt: string): string => {
  const time = Date.parse(createdAt)
  return Number.isNaN(time) ? '-' : new Date(time).toISOString().slice(0, DAY_LENGTH)
}
