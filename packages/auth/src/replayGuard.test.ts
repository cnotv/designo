import { describe, expect, it } from 'vitest'
import { createReplayGuard } from './replayGuard.ts'

describe('replay guard', () => {
  it('lets an attempt through once and refuses it after', () => {
    const guard = createReplayGuard(() => 0)
    expect(guard.consume('state-1', 1000)).toBe(true)
    expect(guard.consume('state-1', 1000)).toBe(false)
    expect(guard.consume('state-2', 1000)).toBe(true)
  })

  it('forgets an attempt once it has expired anyway', () => {
    const time = { now: 0 }
    const guard = createReplayGuard(() => time.now)
    guard.consume('state-1', 1000)
    time.now = 1000
    expect(guard.consume('state-1', 2000)).toBe(true)
  })
})
