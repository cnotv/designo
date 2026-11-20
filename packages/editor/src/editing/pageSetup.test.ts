import { describe, expect, it } from 'vitest'
import { formatLength, readLengthInput } from './pageSetup.ts'

describe('formatLength', () => {
  it('shows points as they are and millimetres to two decimals', () => {
    expect(formatLength(12, 'pt')).toBe(12)
    expect(formatLength(595.2756, 'mm')).toBe(210)
    expect(formatLength(8.504, 'mm')).toBe(3)
  })
})

describe('readLengthInput', () => {
  it('reads a number, never below the minimum', () => {
    expect(readLengthInput('12.5', 0)).toBe(12.5)
    expect(readLengthInput('-3', 0)).toBe(0)
  })

  it('returns undefined for text that is not a number, so the field keeps its value', () => {
    expect(readLengthInput('', 0)).toBeUndefined()
    expect(readLengthInput('wide', 0)).toBeUndefined()
  })
})
