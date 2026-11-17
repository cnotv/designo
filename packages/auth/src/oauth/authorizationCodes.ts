import type { Clock } from '../types.ts'
import { createOpaqueToken, hashToken } from './tokens.ts'
import type { AuthorizationCodeDetails, AuthorizationCodeStore, CodeRedemption } from './types.ts'

const CODE_LIFETIME_MILLISECONDS = 60_000
const DEFAULT_MAX_CODES = 1000

interface StoredCode {
  details: AuthorizationCodeDetails
  expiresAt: number
  isUsed: boolean
  grantId: string | undefined
}

/**
 * Keeps the authorization codes that are waiting to be traded for tokens. In memory on purpose:
 * a code lives sixty seconds, so a restart costing one sign-in beats writing codes to disk. Only
 * hashes are kept. A used code stays until it expires, so a replay is told apart from a guess and
 * can undo what the first use produced.
 * @param clock - The current time source.
 * @param maxCodes - How many codes to hold at once; the oldest is dropped beyond this.
 * @returns The store.
 */
export const createAuthorizationCodeStore = (
  clock: Clock,
  maxCodes: number = DEFAULT_MAX_CODES
): AuthorizationCodeStore => {
  let codes: ReadonlyMap<string, StoredCode> = new Map()

  const withoutExpired = (): [string, StoredCode][] => {
    const now = clock()
    return [...codes].filter(([, stored]) => stored.expiresAt > now)
  }

  return {
    issue: (details) => {
      const code = createOpaqueToken()
      const stored: StoredCode = {
        details,
        expiresAt: clock() + CODE_LIFETIME_MILLISECONDS,
        isUsed: false,
        grantId: undefined
      }
      const entry: [string, StoredCode] = [hashToken(code), stored]
      codes = new Map([...withoutExpired(), entry].slice(-maxCodes))
      return code
    },
    redeem: (code): CodeRedemption => {
      const live = withoutExpired()
      const key = hashToken(code)
      const stored = live.find(([storedKey]) => storedKey === key)?.[1]
      codes = new Map(
        live.map(([storedKey, value]): [string, StoredCode] =>
          storedKey === key ? [storedKey, { ...value, isUsed: true }] : [storedKey, value]
        )
      )
      if (!stored) return { kind: 'unknown' }
      return stored.isUsed
        ? { kind: 'replayed', grantId: stored.grantId }
        : { kind: 'redeemed', details: stored.details }
    },
    recordGrant: (code, grantId) => {
      const key = hashToken(code)
      codes = new Map(
        [...codes].map(([storedKey, value]): [string, StoredCode] =>
          storedKey === key ? [storedKey, { ...value, grantId }] : [storedKey, value]
        )
      )
    }
  }
}
