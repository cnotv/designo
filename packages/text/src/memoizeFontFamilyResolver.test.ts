import type { FontVariant } from '@designo/core'
import { describe, expect, it, vi } from 'vitest'
import { memoizeFontFamilyResolver } from './memoizeFontFamilyResolver.ts'

const REGULAR: FontVariant = { fontWeight: 400, fontStyle: 'normal' }

describe('memoizeFontFamilyResolver', () => {
  it('asks once per family, whatever its case, and asks again after a failure', async () => {
    const resolve = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const memoized = memoizeFontFamilyResolver(resolve)
    await expect(memoized('Lora', REGULAR)).rejects.toThrow('offline')
    await memoized('Lora', REGULAR)
    await memoized('lora', REGULAR)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('asks again for another weight or style of the same family', async () => {
    const resolve = vi.fn().mockResolvedValue(undefined)
    const memoized = memoizeFontFamilyResolver(resolve)
    await memoized('Lora', REGULAR)
    await memoized('Lora', { fontWeight: 700, fontStyle: 'normal' })
    await memoized('Lora', { fontWeight: 400, fontStyle: 'italic' })
    expect(resolve).toHaveBeenCalledTimes(3)
  })
})
