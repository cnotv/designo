import { accountDirectory, createAccountStore, isAuthEnabled, type Account } from '@designo/auth'

export const ACCOUNT_ENVIRONMENT_VARIABLE = 'DESIGNO_ACCOUNT'

const MISSING_ACCOUNT_SETTING = `DESIGNO_AUTH=google needs ${ACCOUNT_ENVIRONMENT_VARIABLE}, the email of the account whose designs this server works on.`

/**
 * Picks the account the stdio server works as, or says why it cannot. Several accounts can share
 * an email, since accounts are matched on Google's id, so an email that does not name exactly one
 * approved account is refused rather than guessed at.
 * @param email - The address from `DESIGNO_ACCOUNT`.
 * @param matches - Every stored account with that address.
 * @returns The approved account, or the message to stop with.
 */
export const chooseAccount = (
  email: string,
  matches: readonly Account[]
): { account: Account } | { problem: string } => {
  const approved = matches.filter((account) => account.status === 'approved')
  const [only] = approved
  if (only && approved.length === 1) return { account: only }
  if (approved.length > 1) {
    return { problem: `More than one approved account uses ${email}, so it names none of them.` }
  }
  const [first] = matches
  if (!first) {
    return {
      problem: `There is no account for ${email}. Sign in to Designo once in the browser to create it.`
    }
  }
  return {
    problem:
      first.status === 'blocked'
        ? `The account for ${email} is blocked.`
        : `The account for ${email} is waiting for approval by an admin.`
  }
}

/**
 * Finds the folder this server reads and writes. With sign-in off that is the data folder itself,
 * as it has always been and `DESIGNO_ACCOUNT` is ignored. With `DESIGNO_AUTH=google` it is the
 * folder of the approved account named by `DESIGNO_ACCOUNT`, so an agent over SSH works on the same
 * designs that account sees in the browser.
 * @param environment - The process environment.
 * @param dataDirectory - Where Designo files live.
 * @returns The folder the tools work in; rejects, with a message that says why, when the account
 * is not given, does not exist, is pending or is blocked.
 */
export const resolveToolDirectory = async (
  environment: NodeJS.ProcessEnv,
  dataDirectory: string
): Promise<string> => {
  if (!isAuthEnabled(environment)) return dataDirectory
  const email = environment[ACCOUNT_ENVIRONMENT_VARIABLE]?.trim().toLowerCase()
  if (!email) throw new Error(MISSING_ACCOUNT_SETTING)
  const chosen = chooseAccount(email, await createAccountStore(dataDirectory).findByEmail(email))
  if ('problem' in chosen) throw new Error(chosen.problem)
  return accountDirectory(dataDirectory, chosen.account.id)
}
