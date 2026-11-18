import { describe, expect, it, vi } from 'vitest'
import { memoizeFontFamilyResolver } from './memoizeFontFamilyResolver.ts'

describe('memoizeFontFamilyResolver', () => {
  it('asks once per family, whatever its case, and asks again after a failure', async () => {
    const resolve = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const memoized = memoizeFontFamilyResolver(resolve)
    await expect(memoized('Lora')).rejects.toThrow('offline')
    await memoized('Lora')
    await memoized('lora')
    expect(resolve).toHaveBeenCalledTimes(2)
  })
})
