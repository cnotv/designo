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
})
