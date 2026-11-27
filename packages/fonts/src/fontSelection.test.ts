import { describe, expect, it } from 'vitest'
import { resolveFontFamilies } from './fontSelection.ts'
import type { FontFamilyFiles } from './types.ts'

const family = (id: string, subsets: Record<string, string[]>): FontFamilyFiles => ({
  id,
  family: id,
  files: Object.entries(subsets).map(([subset, coverage]) => ({
    id: `${id}:${subset}`,
    family: id,
    fontWeight: 400,
    fontStyle: 'normal',
    subset,
    url: `https://fonts.test/${id}-${subset}.ttf`,
    coverage
  }))
})

const GELASIO = family('gelasio', { latin: ['U+0000-00FF'], 'latin-ext': ['U+0100-024F'] })
const INTER = family('inter', { latin: ['U+0000-00FF'], cyrillic: ['U+0400-045F'] })

describe('resolveFontFamilies', () => {
  it('keeps the families found, in the order a text prefers them', async () => {
    const known = new Map([
      ['gelasio', GELASIO],
      ['inter', INTER]
    ])
    const found = await resolveFontFamilies(
      { fontFamily: 'Georgia, serif', fontWeight: 400, fontStyle: 'normal' },
      (name) => Promise.resolve(known.get(name.toLowerCase()))
    )
    expect(found.map((item) => item.id)).toEqual(['gelasio', 'inter'])
  })

  it('keeps a family it found when a fallback after it cannot be looked up', async () => {
    const found = await resolveFontFamilies(
      { fontFamily: 'Georgia, serif', fontWeight: 400, fontStyle: 'normal' },
      (name) =>
        name.toLowerCase() === 'gelasio'
          ? Promise.resolve(GELASIO)
          : Promise.reject(new Error('The font API is not answering'))
    )
    expect(found.map((item) => item.id)).toEqual(['gelasio'])
  })

  it('fails when the family the text asks for cannot be looked up', async () => {
    const lookup = resolveFontFamilies(
      { fontFamily: 'Georgia, serif', fontWeight: 400, fontStyle: 'normal' },
      (name) =>
        name.toLowerCase() === 'inter'
          ? Promise.resolve(INTER)
          : Promise.reject(new Error('The font API is not answering'))
    )
    await expect(lookup).rejects.toThrow('The font API is not answering')
  })

  it('fails when no lookup finds a family and one of them failed', async () => {
    const lookup = resolveFontFamilies(
      { fontFamily: 'Studio Sans', fontWeight: 400, fontStyle: 'normal' },
      (name) =>
        name === 'Studio Sans'
          ? Promise.reject(new Error('The font API is not answering'))
          : Promise.resolve(undefined)
    )
    await expect(lookup).rejects.toThrow('The font API is not answering')
  })
})
