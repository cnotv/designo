import { describe, expect, it } from 'vitest'
import { bucketGlyphZoom, createGlyphCacheKey } from './glyphAtlasKeys.ts'

describe('bucketGlyphZoom', () => {
  it('rounds up to the next power of two, so a glyph is redrawn only when zoom doubles', () => {
    expect(bucketGlyphZoom(9)).toBe(16)
    expect(bucketGlyphZoom(16)).toBe(16)
    expect(bucketGlyphZoom(17)).toBe(32)
    expect(bucketGlyphZoom(100)).toBe(128)
  })

  it('has a smallest and a largest bucket', () => {
    expect(bucketGlyphZoom(0.5)).toBe(8)
    expect(bucketGlyphZoom(0)).toBe(8)
    expect(bucketGlyphZoom(5000)).toBe(256)
  })
})

describe('createGlyphCacheKey', () => {
  it('differs by font, glyph and bucket', () => {
    const base = { fontId: 'inter', glyphId: 5, zoomBucket: 16 }
    const keys = [
      base,
      { ...base, fontId: 'noto-sans-arabic' },
      { ...base, glyphId: 6 },
      { ...base, zoomBucket: 32 }
    ].map(createGlyphCacheKey)
    expect(new Set(keys).size).toBe(4)
  })

  it('is the same for equal keys', () => {
    expect(createGlyphCacheKey({ fontId: 'a', glyphId: 1, zoomBucket: 8 })).toBe(
      createGlyphCacheKey({ fontId: 'a', glyphId: 1, zoomBucket: 8 })
    )
  })
})
