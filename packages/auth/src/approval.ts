import type { Account, AccountStatus, ApprovalRules, VerifiedIdentity } from './types.ts'

const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1)

/**
 * Decides the status a brand new account starts with. An address Google has not verified proves
 * nothing, so it never earns an automatic approval, whatever the rules list.
 * @param identity - Who signed in.
 * @param rules - The admin and automatic approval lists.
 * @returns `approved` for a verified admin or automatically approved address, else `pending`.
 */
export const decideInitialStatus = (
  identity: VerifiedIdentity,
  rules: ApprovalRules
): AccountStatus => {
  if (!identity.emailVerified) return 'pending'
  const email = identity.email.toLowerCase()
  const isListed = rules.adminEmails.includes(email) || rules.autoApproveEmails.includes(email)
  const isListedDomain = rules.autoApproveDomains.includes(domainOf(email))
  return isListed || isListedDomain ? 'approved' : 'pending'
}

/**
 * Says whether an account is an admin. It is derived, never stored, so removing an address from
 * the list takes effect at once, and it needs a verified address like every other privilege.
 * @param account - The account to check.
 * @param adminEmails - The configured admin addresses, lower case.
 * @returns True when the account's verified email is on the list.
 */
export const isAdminAccount = (
  account: Pick<Account, 'email' | 'emailVerified'>,
  adminEmails: readonly string[]
): boolean => account.emailVerified && adminEmails.includes(account.email.toLowerCase())

/**
 * Decides the status an existing account has after signing in. A verified admin is always
 * approved, even if the account was made pending before the address joined the list or was
 * blocked, so the people who run the server can never be locked out; for anyone else only an
 * admin changes a status, so it stays as it is.
 * @param current - The status stored for the account.
 * @param identity - Who signed in, with the email as Google reports it now.
 * @param adminEmails - The configured admin addresses, lower case.
 * @returns The status the account should have.
 */
export const decideStatusOnSignIn = (
  current: AccountStatus,
  identity: VerifiedIdentity,
  adminEmails: readonly string[]
): AccountStatus => (isAdminAccount(identity, adminEmails) ? 'approved' : current)
