import { describe, expect, it, vi } from 'vitest'
import { findUploadedFamily, withUploadedFonts } from './uploadedFonts.ts'
import type { UploadedFont } from './types.ts'

const font = (id: string, fontWeight: number, fontStyle: 'normal' | 'italic'): UploadedFont => ({
  id: `${id.repeat(64)}.ttf`,
  family: 'Studio Sans',
  fontWeight,
  fontStyle,
  url: `/fonts/${id}`
})

const FONTS = [font('a', 400, 'normal'), font('b', 700, 'normal'), font('c', 400, 'italic')]

describe('findUploadedFamily', () => {
  it('matches the family name as a font menu does, whatever its case and spacing', () => {
    const found = findUploadedFamily(FONTS, 'studio  sans', {
      fontWeight: 400,
      fontStyle: 'normal'
    })
    expect(found?.family).toBe('Studio Sans')
    expect(found?.files.map((file) => file.url)).toEqual(['/fonts/a'])
  })

  it('picks the nearest weight, and the style before any weight', () => {
    const pick = (fontWeight: number, fontStyle: 'normal' | 'italic') =>
      findUploadedFamily(FONTS, 'Studio Sans', { fontWeight, fontStyle })?.files[0]?.url
    expect(pick(600, 'normal')).toBe('/fonts/b')
    expect(pick(700, 'italic')).toBe('/fonts/c')
  })

  it('lets the file claim every character until its own map is read', () => {
    const file = findUploadedFamily(FONTS, 'Studio Sans', { fontWeight: 400, fontStyle: 'normal' })
      ?.files[0]
    expect(file?.coverage).toEqual(['U+0000-10FFFF'])
    expect(file?.id).toBe(`uploaded:${'a'.repeat(64)}.ttf`)
  })

  it('finds nothing for a family not uploaded', () => {
    expect(findUploadedFamily(FONTS, 'Inter', { fontWeight: 400, fontStyle: 'normal' })).toBe(
      undefined
    )
  })
})

describe('withUploadedFonts', () => {
  it('answers an uploaded family itself and asks the fallback for the rest', async () => {
    const fallback = vi.fn(() => Promise.resolve(undefined))
    const resolve = withUploadedFonts(() => Promise.resolve(FONTS), fallback)
    const variant = { fontWeight: 400, fontStyle: 'normal' as const }
    expect((await resolve('Studio Sans', variant))?.family).toBe('Studio Sans')
    expect(fallback).not.toHaveBeenCalled()
    await resolve('Inter', variant)
    expect(fallback).toHaveBeenCalledWith('Inter', variant)
  })
})
