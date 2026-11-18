import { beforeAll, describe, expect, it } from 'vitest'
import { BUNDLED_FONT_CATALOG } from './bundledFontCatalog.ts'
import { readBundledFontBytes } from './fixtures/fontFiles.ts'
import { createFontRegistry } from './fontRegistry.ts'
import { createHarfBuzzShapingFont } from './harfBuzzFont.ts'
import { createTextShaper } from './textShaper.ts'
import type { FontRegistry, TextShaper } from './types.ts'

describe('createTextShaper', () => {
  let registry: FontRegistry
  let shaper: TextShaper

  beforeAll(async () => {
    registry = createFontRegistry({
      catalog: BUNDLED_FONT_CATALOG,
      loadBytes: readBundledFontBytes,
      createShapingFont: createHarfBuzzShapingFont
    })
    await registry.loadFontsForText('Hello שלום مرحبا')
    shaper = createTextShaper(registry)
  })

  it('shapes one font run for text in one script', () => {
    const runs = shaper.shapeRuns('Hello', 'ltr')
    expect(runs.map((run) => run.fontId)).toEqual(['inter'])
    expect(runs[0]?.glyphs).toHaveLength(5)
    expect(runs[0]?.unitsPerEm).toBe(2048)
  })

  it('gives runs in reading order for left to right text, with clusters into the whole string', () => {
    const runs = shaper.shapeRuns('Hello שלום', 'ltr')
    expect(runs.map((run) => run.fontId)).toEqual(['inter', 'noto-sans-hebrew'])
    expect(runs[1]?.glyphs.map((glyph) => glyph.cluster).every((cluster) => cluster >= 6)).toBe(
      true
    )
  })

  it('lists runs last first for right to left text, so they place left to right', () => {
    const runs = shaper.shapeRuns('שלום Hello', 'rtl')
    expect(runs.map((run) => run.fontId)).toEqual(['inter', 'noto-sans-hebrew'])
    expect(runs.every((run) => run.direction === 'rtl')).toBe(true)
  })

  it('has no runs for an empty string', () => {
    expect(shaper.shapeRuns('', 'ltr')).toEqual([])
  })

  it('reports the default font metrics', () => {
    expect(shaper.getPrimaryMetrics().unitsPerEm).toBe(2048)
  })

  it('says to load fonts first when one is missing', () => {
    const emptyShaper = createTextShaper(
      createFontRegistry({
        catalog: BUNDLED_FONT_CATALOG,
        loadBytes: readBundledFontBytes,
        createShapingFont: createHarfBuzzShapingFont
      })
    )
    expect(() => emptyShaper.shapeRuns('Hello', 'ltr')).toThrow('loadFontsForText')
  })

  it('draws a script whose font has not loaded with the default font rather than failing', () => {
    const latinOnly = createFontRegistry({
      catalog: BUNDLED_FONT_CATALOG,
      loadBytes: readBundledFontBytes,
      createShapingFont: createHarfBuzzShapingFont
    })
    return latinOnly.loadFontsForText('Hello').then(() => {
      const runs = createTextShaper(latinOnly).shapeRuns('שלום', 'rtl')
      expect(runs.map((run) => run.fontId)).toEqual(['inter'])
    })
  })
})
