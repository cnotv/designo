import { beforeAll, describe, expect, it } from 'vitest'
import {
  FIXTURE_FONT_CATALOG,
  LIGATURE_FIXTURE_FILE,
  readFixtureFontBytes
} from './fixtures/fontFiles.ts'
import { findFontForCodePoint } from './fontRegistry.ts'
import { createHarfBuzzShapingFont } from './harfBuzzFont.ts'
import type { ShapingFont } from './types.ts'

const openCatalogFont = async (fontId: string): Promise<ShapingFont> => {
  const definition = FIXTURE_FONT_CATALOG.fonts.find((font) => font.id === fontId)
  if (!definition) throw new Error(`No font ${fontId}`)
  return createHarfBuzzShapingFont(await readFixtureFontBytes(definition.url))
}

const totalAdvance = (font: ShapingFont, text: string): number =>
  font.shape(text, 'ltr').reduce((sum, glyph) => sum + glyph.xAdvance, 0)

describe('HarfBuzz shaping', () => {
  let inter: ShapingFont
  let arabic: ShapingFont
  let devanagari: ShapingFont
  let ligatureFont: ShapingFont

  beforeAll(async () => {
    inter = await openCatalogFont('inter')
    arabic = await openCatalogFont('noto-sans-arabic')
    devanagari = await openCatalogFont('noto-sans-devanagari')
    ligatureFont = await createHarfBuzzShapingFont(
      await readFixtureFontBytes(LIGATURE_FIXTURE_FILE)
    )
  })

  it('reads the font metrics', () => {
    expect(inter.metrics.unitsPerEm).toBe(2048)
    expect(inter.metrics.ascender).toBeGreaterThan(0)
    expect(inter.metrics.descender).toBeLessThan(0)
  })

  it('gives one glyph per letter for plain Latin text, in order, with clusters from zero', () => {
    const glyphs = inter.shape('Hello', 'ltr')
    expect(glyphs.map((glyph) => glyph.cluster)).toEqual([0, 1, 2, 3, 4])
    expect(glyphs.every((glyph) => glyph.xAdvance > 0 && glyph.glyphId > 0)).toBe(true)
  })

  it('collapses the fi ligature into one glyph where the font has it', () => {
    expect(ligatureFont.shape('fi', 'ltr')).toHaveLength(1)
    expect(ligatureFont.shape('f i', 'ltr')).toHaveLength(3)
    expect(ligatureFont.shape('fj', 'ltr')).toHaveLength(2)
  })

  it('kerns a pair, so it is narrower than its letters apart', () => {
    const kerned = totalAdvance(inter, 'AV')
    const apart = totalAdvance(inter, 'A') + totalAdvance(inter, 'V')
    expect(kerned).toBeLessThan(apart)
  })

  it('counts clusters in UTF-16 units, so a surrogate pair takes two', () => {
    const glyphs = inter.shape('a😀b', 'ltr')
    expect(glyphs.map((glyph) => glyph.cluster)).toEqual([0, 1, 3])
  })

  it('shapes Arabic right to left with joined forms', () => {
    const word = 'سلام'
    const glyphs = arabic.shape(word, 'rtl')
    const clusters = glyphs.map((glyph) => glyph.cluster)
    expect(clusters).toEqual(clusters.toSorted((first, second) => second - first))
    expect(clusters[0]).toBe(word.length - 1)

    const isolatedIds = [...word].flatMap((letter) =>
      arabic.shape(letter, 'rtl').map((glyph) => glyph.glyphId)
    )
    const joinedIds = glyphs.map((glyph) => glyph.glyphId)
    expect(joinedIds).not.toEqual(isolatedIds.toReversed())
  })

  it('shapes a Devanagari conjunct into fewer glyphs than it has code points', () => {
    const conjunct = 'क्ष'
    expect([...conjunct]).toHaveLength(3)
    expect(devanagari.shape(conjunct, 'ltr').length).toBeLessThan(3)
  })

  it('tells which characters a font draws', () => {
    expect(inter.hasGlyph('A'.codePointAt(0) ?? 0)).toBe(true)
    expect(inter.hasGlyph(0x05d0)).toBe(false)
    expect(arabic.hasGlyph(0x0633)).toBe(true)
  })

  it('returns a glyph outline as path data with extents', () => {
    const [glyph] = inter.shape('A', 'ltr')
    const outline = inter.getGlyphOutline(glyph?.glyphId ?? 0)
    expect(outline.pathData.startsWith('M')).toBe(true)
    expect(outline.extents?.width).toBeGreaterThan(0)
  })

  it('shapes the same string the same way each time, since the buffer is reused', () => {
    const first = inter.shape('Hello', 'ltr')
    inter.shape('שלום', 'rtl')
    expect(inter.shape('Hello', 'ltr')).toEqual(first)
  })
})

describe('the font catalog', () => {
  const BASIC_MULTILINGUAL_PLANE = Array.from({ length: 0x10000 }, (_, codePoint) => codePoint)

  it.each(FIXTURE_FONT_CATALOG.fonts.map((definition) => definition.id))(
    'claims every character %s really draws, so no font is skipped for a character it has',
    async (fontId) => {
      const font = await openCatalogFont(fontId)
      const unclaimed = BASIC_MULTILINGUAL_PLANE.filter(
        (codePoint) =>
          font.hasGlyph(codePoint) &&
          findFontForCodePoint(FIXTURE_FONT_CATALOG, codePoint, fontId) !== fontId
      )
      expect(unclaimed.map((codePoint) => codePoint.toString(16))).toEqual([])
    }
  )
})
