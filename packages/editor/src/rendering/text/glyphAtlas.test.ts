import { describe, expect, it, vi } from 'vitest'
import { createGlyphAtlas } from './glyphAtlas.ts'
import type { GlyphKey, GlyphRasterizer, RasterizedGlyph } from '@designo/text'

const key = (glyphId: number, overrides: Partial<GlyphKey> = {}): GlyphKey => ({
  fontId: 'inter',
  glyphId,
  zoomBucket: 16,
  ...overrides
})

// Glyph 0 is a space. Ids below 50 are squares as wide as the id, so tests can pick a size.
// Ids from 100 are all 14 wide, which with padding takes 16, so a 32 page holds exactly four.
const STANDARD_SIDE = 14
const sideOf = (glyphId: number): number => {
  if (glyphId === 0) return 0
  return glyphId < 50 ? glyphId : STANDARD_SIDE
}

const squareRasterizer = (): GlyphRasterizer & ReturnType<typeof vi.fn> =>
  vi.fn((glyphKey: GlyphKey): RasterizedGlyph => {
    const side = sideOf(glyphKey.glyphId)
    return {
      width: side,
      height: side,
      bearingX: 1,
      bearingY: side,
      pixels: new Uint8Array(side * side).fill(glyphKey.glyphId)
    }
  })

const createAtlas = (options: { pageSize?: number; maxPages?: number; padding?: number } = {}) => {
  const rasterizeGlyph = squareRasterizer()
  const atlas = createGlyphAtlas({
    pageWidth: options.pageSize ?? 64,
    pageHeight: options.pageSize ?? 64,
    maxPages: options.maxPages ?? 2,
    padding: options.padding ?? 1,
    rasterizeGlyph
  })
  return { atlas, rasterizeGlyph }
}

// Fills a 32 page with four standard glyphs, ids from the first.
const fillPage = (atlas: ReturnType<typeof createAtlas>['atlas'], firstGlyphId: number) =>
  [0, 1, 2, 3].map((offset) => atlas.lookupGlyph(key(firstGlyphId + offset)))

describe('createGlyphAtlas', () => {
  it('draws a glyph the first time it is asked for and places it after the padding', () => {
    const { atlas, rasterizeGlyph } = createAtlas()
    const glyph = atlas.lookupGlyph(key(10))
    expect(rasterizeGlyph).toHaveBeenCalledTimes(1)
    expect(glyph).toMatchObject({
      pageIndex: 0,
      rectangle: { x: 1, y: 1, width: 10, height: 10 },
      bearingX: 1,
      bearingY: 10,
      isEmpty: false
    })
  })

  it('remembers a glyph, so asking again draws nothing', () => {
    const { atlas, rasterizeGlyph } = createAtlas()
    const first = atlas.lookupGlyph(key(10))
    const second = atlas.lookupGlyph(key(10))
    expect(second).toEqual(first)
    expect(rasterizeGlyph).toHaveBeenCalledTimes(1)
    expect(atlas.getGlyphCount()).toBe(1)
  })

  it('keeps glyphs of different fonts, ids and zoom buckets apart', () => {
    const { atlas, rasterizeGlyph } = createAtlas({ pageSize: 256 })
    atlas.lookupGlyph(key(10))
    atlas.lookupGlyph(key(10, { fontId: 'noto-sans-arabic' }))
    atlas.lookupGlyph(key(11))
    atlas.lookupGlyph(key(10, { zoomBucket: 32 }))
    expect(rasterizeGlyph).toHaveBeenCalledTimes(4)
    expect(atlas.getGlyphCount()).toBe(4)
  })

  it('leaves padding between neighbours so filtering at an edge cannot pick one up', () => {
    const { atlas } = createAtlas({ padding: 2 })
    const first = atlas.lookupGlyph(key(10))
    const second = atlas.lookupGlyph(key(10, { glyphId: 11 }))
    const gap =
      (second?.rectangle.x ?? 0) - ((first?.rectangle.x ?? 0) + (first?.rectangle.width ?? 0))
    expect(gap).toBe(4)
  })

  it('hands over each glyph for upload once', () => {
    const { atlas } = createAtlas()
    atlas.lookupGlyph(key(3))
    atlas.lookupGlyph(key(3))
    const uploads = atlas.takePendingUploads()
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toMatchObject({ pageIndex: 0, rectangle: { width: 3, height: 3 } })
    expect(uploads[0]?.pixels).toEqual(new Uint8Array(9).fill(3))
    expect(atlas.takePendingUploads()).toEqual([])
  })

  it('gives a glyph with nothing to draw no room and no upload', () => {
    const { atlas } = createAtlas()
    const space = atlas.lookupGlyph(key(0))
    expect(space).toMatchObject({ isEmpty: true, rectangle: { width: 0, height: 0 } })
    expect(atlas.takePendingUploads()).toEqual([])
    expect(atlas.getPageCount()).toBe(0)
  })

  it('refuses a glyph that cannot fit a page, without growing or evicting', () => {
    const { atlas } = createAtlas({ pageSize: 16 })
    expect(atlas.lookupGlyph(key(20))).toBeUndefined()
    expect(atlas.getPageCount()).toBe(0)
  })

  it('refuses a glyph whose bitmap is not as big as it says', () => {
    const atlas = createGlyphAtlas({
      pageWidth: 32,
      pageHeight: 32,
      maxPages: 1,
      padding: 1,
      rasterizeGlyph: () => ({
        width: 4,
        height: 4,
        bearingX: 0,
        bearingY: 4,
        pixels: new Uint8Array(3)
      })
    })
    expect(() => atlas.lookupGlyph(key(1))).toThrow('pixels')
  })

  describe('with more glyphs than a page holds', () => {
    it('grows to a second page', () => {
      const { atlas } = createAtlas({ pageSize: 32, maxPages: 2 })
      const glyphs = [...fillPage(atlas, 100), atlas.lookupGlyph(key(104))]
      expect(glyphs.slice(0, 4).every((glyph) => glyph?.pageIndex === 0)).toBe(true)
      expect(glyphs[4]?.pageIndex).toBe(1)
      expect(atlas.getPageCount()).toBe(2)
    })

    it('keeps finding glyphs on the first page after growing', () => {
      const { atlas, rasterizeGlyph } = createAtlas({ pageSize: 32, maxPages: 2 })
      fillPage(atlas, 100)
      atlas.lookupGlyph(key(104))
      const calls = rasterizeGlyph.mock.calls.length
      expect(atlas.lookupGlyph(key(100))?.pageIndex).toBe(0)
      expect(rasterizeGlyph.mock.calls.length).toBe(calls)
    })

    it('says so when every page is in use this frame, rather than overwrite a glyph in it', () => {
      const { atlas } = createAtlas({ pageSize: 32, maxPages: 1 })
      fillPage(atlas, 100)
      expect(atlas.lookupGlyph(key(104))).toBeUndefined()
      expect(atlas.takeClearedPages()).toEqual([])
    })

    const fillBothPages = () => {
      const fixture = createAtlas({ pageSize: 32, maxPages: 2 })
      fillPage(fixture.atlas, 100)
      fillPage(fixture.atlas, 104)
      fixture.atlas.takePendingUploads()
      return fixture
    }

    it('evicts the page unused for longest once a new frame begins', () => {
      const { atlas, rasterizeGlyph } = fillBothPages()
      atlas.beginFrame()
      atlas.lookupGlyph(key(104))
      atlas.beginFrame()
      expect(atlas.lookupGlyph(key(108))?.pageIndex).toBe(0)
      expect(atlas.getPageCount()).toBe(2)
      // Page 1 was used last frame, so page 0 was the one cleared.
      expect(atlas.takeClearedPages()).toEqual([0])
      expect(atlas.takeClearedPages()).toEqual([])

      const before = rasterizeGlyph.mock.calls.length
      atlas.lookupGlyph(key(100))
      expect(rasterizeGlyph.mock.calls.length).toBe(before + 1)
    })

    it('forgets every glyph on the evicted page and none on the others', () => {
      const { atlas, rasterizeGlyph } = fillBothPages()
      expect(atlas.getGlyphCount()).toBe(8)
      atlas.beginFrame()
      atlas.lookupGlyph(key(104))
      atlas.beginFrame()
      atlas.lookupGlyph(key(108))
      // The four on page 0 are gone, the four on page 1 stay, and 108 is new.
      expect(atlas.getGlyphCount()).toBe(5)
      const before = rasterizeGlyph.mock.calls.length
      atlas.lookupGlyph(key(105))
      expect(rasterizeGlyph.mock.calls.length).toBe(before)
    })

    it('drops uploads still waiting for a page that was evicted', () => {
      const { atlas } = createAtlas({ pageSize: 32, maxPages: 1 })
      fillPage(atlas, 100)
      atlas.beginFrame()
      atlas.lookupGlyph(key(104))
      const uploads = atlas.takePendingUploads()
      expect(uploads.map((upload) => upload.pixels[0])).toEqual([104])
    })

    it('never evicts a page a glyph was looked up in during the current frame', () => {
      const { atlas } = fillBothPages()
      atlas.beginFrame()
      atlas.lookupGlyph(key(100))
      atlas.lookupGlyph(key(104))
      expect(atlas.lookupGlyph(key(108))).toBeUndefined()
      expect(atlas.takeClearedPages()).toEqual([])
    })
  })
})
