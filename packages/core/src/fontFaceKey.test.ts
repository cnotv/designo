import { describe, expect, it } from 'vitest'
import { toFaceKey } from './fontFamilies.ts'

describe('toFaceKey', () => {
  const regular = { fontFamily: 'Lora', fontWeight: 400, fontStyle: 'normal' } as const

  it('is the same for the same face', () => {
    expect(toFaceKey({ ...regular })).toBe(toFaceKey(regular))
  })

  it.each([{ fontFamily: 'Inter' }, { fontWeight: 700 }, { fontStyle: 'italic' }] as const)(
    'differs when %j differs',
    (change) => {
      expect(toFaceKey({ ...regular, ...change })).not.toBe(toFaceKey(regular))
    }
  )
})
