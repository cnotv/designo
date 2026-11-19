import { listFontCandidates, type TextFace } from '@designo/core'
import type { FontFamilyFiles } from '@designo/fonts'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureFontLibrary, createFixtureFontStore } from './fixtures/fontFiles.ts'
import { createFontLibrary, toFontCatalog } from './fontLibrary.ts'
import { createFontStore } from './fontRegistry.ts'
import type { ShapingFont } from './types.ts'

const regular = (fontFamily: string): TextFace => ({
  fontFamily,
  fontWeight: 400,
  fontStyle: 'normal'
})

const family = (id: string, subsets: Record<string, string[]>): FontFamilyFiles => ({
  id,
  family: id,
  files: Object.entries(subsets).map(([subset, coverage]) => ({
    id: `${id}:${subset}`,
    family: id,
    fontWeight: 400,
    fontStyle: 'normal',
    subset,
    url: `${id}-${subset}.ttf`,
    coverage
  }))
})

describe('toFontCatalog', () => {
  it('puts the first family first and makes its Latin file the default', () => {
    const catalog = toFontCatalog([
      family('gelasio', { latin: ['U+0000-00FF'], 'latin-ext': ['U+0100-024F'] }),
      family('inter', { latin: ['U+0000-00FF'], cyrillic: ['U+0400-045F'] })
    ])
    expect(catalog?.defaultFontId).toBe('gelasio:latin')
    expect(catalog?.fonts.map((font) => font.id)).toEqual([
      'gelasio:latin',
      'gelasio:latin-ext',
      'inter:latin',
      'inter:cyrillic'
    ])
  })

  it('has no catalog when no family was found', () => {
    expect(toFontCatalog([])).toBeUndefined()
  })
})

describe('createFontLibrary', () => {
  it('has no registry for a list until its families are found, then one with them first', async () => {
    const library = createFixtureFontLibrary()
    expect(library.getRegistry(regular('Noto Sans Hebrew, sans-serif'))).toBeUndefined()
    await library.loadFamilies(regular('Noto Sans Hebrew, sans-serif'))
    expect(library.getRegistry(regular('Noto Sans Hebrew, sans-serif'))?.catalog.fonts[0]?.id).toBe(
      'noto-sans-hebrew'
    )
  })

  it('falls back to the default family for a list the font API has none of', async () => {
    const library = createFixtureFontLibrary()
    await library.loadFamilies(regular('Papyrus, cursive'))
    expect(library.getRegistry(regular('Papyrus, cursive'))?.catalog.defaultFontId).toBe('inter')
  })

  it('looks a list up once while it loads, and rejects when no family at all is found', async () => {
    const resolveFamily = vi.fn(async () => undefined)
    const library = createFontLibrary({ resolveFamily, store: createFixtureFontStore() })
    const first = library.loadFamilies(regular('Lora'))
    const second = library.loadFamilies(regular('Lora'))
    await expect(first).rejects.toThrow('The font API has none of the families in Lora')
    await expect(second).rejects.toThrow()
    expect(resolveFamily).toHaveBeenCalledTimes(listFontCandidates('Lora').length)
  })

  it('shares loaded files between lists, so a file loads once', async () => {
    const loadBytes = vi.fn(async () => new Uint8Array([1]))
    const font: ShapingFont = {
      metrics: { unitsPerEm: 1000, ascender: 800, descender: -200 },
      shape: () => [],
      hasGlyph: () => true,
      getGlyphOutline: () => ({ pathData: '', extents: undefined })
    }
    const library = createFixtureFontLibrary(
      createFontStore({ loadBytes, createShapingFont: async () => font })
    )
    await library.loadFamilies(regular('Inter'))
    await library.loadFamilies(regular('Inter, sans-serif'))
    await library.getRegistry(regular('Inter'))?.loadFont('inter')
    await library.getRegistry(regular('Inter, sans-serif'))?.loadFont('inter')
    expect(loadBytes).toHaveBeenCalledTimes(1)
    expect(library.getFont('inter')).toBe(font)
  })
})
