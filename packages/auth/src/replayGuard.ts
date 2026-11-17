import type { Clock, ReplayGuard } from './types.ts'

/**
 * Remembers which sign-in attempts have already come back, so a callback URL that leaks, through
 * a log or browser history, cannot be used a second time while its cookie is still valid.
 * Memory only: a restart forgets, which is safe because the attempts live ten minutes.
 * @param clock - The current time source.
 * @returns The guard.
 */
export const createReplayGuard = (clock: Clock): ReplayGuard => {
  // Attempt state to the time it expires anyway; rebuilt on each use, never edited in place.
  let seenStates: ReadonlyMap<string, number> = new Map()
  return {
    consume: (state, expiresAt) => {
      const now = clock()
      const stillRemembered = [...seenStates].filter(([, seenExpiry]) => seenExpiry > now)
      if (stillRemembered.some(([seenState]) => seenState === state)) {
        seenStates = new Map(stillRemembered)
        return false
      }
      seenStates = new Map([...stillRemembered, [state, expiresAt]])
      return true
    }
  }
}
