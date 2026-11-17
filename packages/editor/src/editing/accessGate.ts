import { z } from 'zod'
import type { AccessAnswer, GateScreen } from './types.ts'

export const ACCESS_ROUTE = '/api/me'
export const SIGN_IN_ROUTE = '/auth/google'
export const SIGN_OUT_ROUTE = '/auth/logout'

const HTTP_OK = 200
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403

const SIGN_IN_FAILED_VALUE = 'failed'

const accountAnswerSchema = z.object({
  email: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'approved', 'blocked']),
  isAdmin: z.boolean()
})

/**
 * Reads the server's answer to "who am I?". Anything that is not clearly a sign-in answer, such as
 * the editor's own HTML from a static host or the dev server, means there is nothing to gate:
 * the editor then works exactly as it does without sign-in.
 * @param status - The HTTP status of the answer.
 * @param body - The parsed JSON body, or undefined when there was none.
 * @returns What the answer says about the visitor.
 */
export const readAccessAnswer = (status: number, body: unknown): AccessAnswer => {
  if (status === HTTP_UNAUTHORIZED) return { kind: 'signed-out' }
  const account = accountAnswerSchema.safeParse(body)
  return status === HTTP_OK && account.success
    ? { kind: 'account', ...account.data }
    : { kind: 'not-required' }
}

/**
 * Says whether a response from the files API means the visitor may no longer use it.
 * @param status - The HTTP status of the response.
 * @returns True for 401 (signed out) and 403 (waiting for approval or blocked).
 */
export const isAccessRefusal = (status: number): boolean =>
  status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN

/**
 * Decides which screen to show.
 * @param answer - What `/api/me` said.
 * @param search - The page's query string, where a failed sign-in leaves `sign_in=failed`.
 * @returns The editor, or the gate that stands in front of it.
 */
export const decideGateScreen = (answer: AccessAnswer, search: string): GateScreen => {
  if (answer.kind === 'not-required') return { screen: 'editor' }
  if (answer.kind === 'signed-out') {
    return {
      screen: 'signed-out',
      signInFailed: new URLSearchParams(search).get('sign_in') === SIGN_IN_FAILED_VALUE
    }
  }
  if (answer.status === 'pending') return { screen: 'pending', email: answer.email }
  if (answer.status === 'blocked') return { screen: 'blocked', email: answer.email }
  return {
    screen: 'editor',
    account: { email: answer.email, name: answer.name, isAdmin: answer.isAdmin }
  }
}
