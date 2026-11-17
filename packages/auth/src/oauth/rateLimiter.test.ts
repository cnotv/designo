import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rateLimiter.ts'

const options = { limit: 3, windowMilliseconds: 1000, maxKeys: 4 }

describe('createRateLimiter', () => {
  it('allows requests up to the limit and refuses the next', () => {
    const limiter = createRateLimiter(options, () => 0)
    expect([1, 2, 3, 4].map(() => limiter.allow('a'))).toEqual([true, true, true, false])
  })

  it('counts each key on its own', () => {
    const limiter = createRateLimiter(options, () => 0)
    ;[1, 2, 3].forEach(() => limiter.allow('a'))
    expect(limiter.allow('b')).toBe(true)
  })

  it('starts counting again when the window is over', () => {
    const time = { now: 0 }
    const limiter = createRateLimiter(options, () => time.now)
    ;[1, 2, 3, 4].forEach(() => limiter.allow('a'))
    time.now = 1000
    expect(limiter.allow('a')).toBe(true)
  })

  it('forgets the oldest key beyond maxKeys instead of growing', () => {
    const time = { now: 0 }
    const limiter = createRateLimiter(options, () => time.now)
    ;[1, 2, 3, 4].forEach(() => limiter.allow('victim'))
    // Four newer keys push the victim out, so its count starts over: bounded memory wins over
    // exact counting for keys that have gone quiet.
    ;['k1', 'k2', 'k3', 'k4'].forEach((key) => {
      time.now += 1
      limiter.allow(key)
    })
    expect(limiter.allow('victim')).toBe(true)
  })

  it('keeps refusing a key that keeps asking, whatever other keys do', () => {
    const limiter = createRateLimiter(options, () => 0)
    ;[1, 2, 3].forEach(() => limiter.allow('a'))
    limiter.allow('b')
    expect(limiter.allow('a')).toBe(false)
  })
})
