import { ref } from 'vue'
import { z } from 'zod'
import {
  ADMIN_ACCOUNTS_ROUTE,
  accountStatusRoute,
  isAdminRefusal,
  readAccountList,
  readChangedAccount,
  sortAccountsForReview,
  statusAfterAction
} from '../editing/accountAdministration.ts'
import type { AccountAction, AccountSummary } from '../editing/types.ts'
import type { AccountAdministration } from './types.ts'

const errorBodySchema = z.object({ error: z.string() })

const readJson = async (response: Response): Promise<unknown> =>
  response.json().catch(() => undefined)

const readServerMessage = (body: unknown): string | undefined => {
  const parsed = errorBodySchema.safeParse(body)
  return parsed.success ? parsed.data.error : undefined
}

const replaceAccount = (
  accounts: readonly AccountSummary[],
  changed: AccountSummary
): readonly AccountSummary[] =>
  sortAccountsForReview(accounts.map((account) => (account.id === changed.id ? changed : account)))

/**
 * Loads the accounts for the admin screen and sends the admin's decisions to the server.
 * @param onAccessRefused - Called when the server says the visitor may no longer manage
 * accounts, so the app can look at who the visitor is again.
 * @returns The accounts, the state of the request and the ways to load and change them.
 */
export const useAccountAdministration = (onAccessRefused: () => void): AccountAdministration => {
  const accounts = ref<readonly AccountSummary[]>([])
  const isLoading = ref(false)
  const busyAccountId = ref<string>()
  const error = ref<string>()

  const load = async (): Promise<void> => {
    isLoading.value = true
    error.value = undefined
    const response = await fetch(ADMIN_ACCOUNTS_ROUTE).catch(() => undefined)
    const list = response ? readAccountList(response.status, await readJson(response)) : undefined
    isLoading.value = false
    if (list) {
      accounts.value = sortAccountsForReview(list)
      return
    }
    error.value = 'The accounts could not be loaded.'
    if (response && isAdminRefusal(response.status)) onAccessRefused()
  }

  const changeAccount = async (accountId: string, action: AccountAction): Promise<void> => {
    busyAccountId.value = accountId
    error.value = undefined
    const response = await fetch(accountStatusRoute(accountId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: statusAfterAction(action) })
    }).catch(() => undefined)
    const body = response ? await readJson(response) : undefined
    const changed = response ? readChangedAccount(response.status, body) : undefined
    busyAccountId.value = undefined
    if (changed) {
      accounts.value = replaceAccount(accounts.value, changed)
      return
    }
    error.value = readServerMessage(body) ?? 'The change was not saved.'
    if (response && isAdminRefusal(response.status)) onAccessRefused()
  }

  return { accounts, isLoading, busyAccountId, error, load, changeAccount }
}
