import type { Clock } from '../types.ts'
import type { RateLimiter, RateLimiterOptions } from './types.ts'

interface Bucket {
  windowStart: number
  count: number
}

/**
 * A fixed-window counter per key, in memory. It keeps the open endpoints, registration and the
 * token endpoint, from being hammered; it is not an accounting system, so it also stays small:
 * beyond `maxKeys` the key that asked longest ago is forgotten.
 * @param options - Requests allowed per window and how many keys to remember.
 * @param clock - The current time source.
 * @returns The limiter.
 */
export const createRateLimiter = (options: RateLimiterOptions, clock: Clock): RateLimiter => {
  // Rebuilt on every use rather than edited in place; a Map keeps its keys in insertion order.
  let buckets: ReadonlyMap<string, Bucket> = new Map()
  return {
    allow: (key) => {
      const now = clock()
      const current = buckets.get(key)
      const bucket: Bucket =
        current && now - current.windowStart < options.windowMilliseconds
          ? { windowStart: current.windowStart, count: current.count + 1 }
          : { windowStart: now, count: 1 }
      const others = [...buckets].filter(([otherKey]) => otherKey !== key)
      const entry: [string, Bucket] = [key, bucket]
      // The key moves to the end, so the front of the map is always who asked longest ago.
      buckets = new Map([...others, entry].slice(-options.maxKeys))
      return bucket.count <= options.limit
    }
  }
}
