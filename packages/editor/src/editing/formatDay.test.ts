import { describe, expect, it } from 'vitest'
import { formatDay } from './formatDay.ts'

describe('formatDay', () => {
  it('shows the day, in UTC so everyone reads the same date', () => {
    expect(formatDay('2026-03-04T23:59:59.000Z')).toBe('2026-03-04')
  })

  it('shows a dash for a date that cannot be read', () => {
    expect(formatDay('not a date')).toBe('-')
  })
})
