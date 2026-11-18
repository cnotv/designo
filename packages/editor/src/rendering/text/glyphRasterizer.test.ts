import { describe, expect, it, vi } from 'vitest'
import { createGlyphRasterizer } from './glyphRasterizer.ts'
import type { FontRegistry, GlyphExtents, GlyphRasterPlan, ShapingFont } from './types.ts'

const boxExtents: GlyphExtents = { xBearing: 100, yBearing: 700, width: 500, height: -700 }

const createFont = (extents: GlyphExtents | undefined, pathData = 'M0,0L1,1Z'): ShapingFont => ({
  metrics: { unitsPerEm: 1000, ascender: 800, descender: -200 },
  shape: () => [],
  hasGlyph: () => true,
  getGlyphOutline: () => ({ pathData, extents })
})

const createRegistry = (font: ShapingFont | undefined): FontRegistry => ({
  catalog: { defaultFontId: 'inter', fonts: [] },
  loadFontsForText: async () => undefined,
  loadFont: async () => undefined,
  getFont: () => font
})

const draw = (plan: GlyphRasterPlan, _pathData = '') =>
  new Uint8Array(plan.width * plan.height).fill(255)

describe('createGlyphRasterizer', () => {
  it('draws a glyph at the bucket size and reports where its bitmap sits', () => {
    const rasterize = createGlyphRasterizer(createRegistry(createFont(boxExtents)), draw)
    const glyph = rasterize({ fontId: 'inter', glyphId: 5, zoomBucket: 100 })
    // 100 pixels per 1000 units: the box is 50 by 70 pixels, with a margin pixel on each side.
    expect(glyph).toMatchObject({ width: 52, height: 72, bearingX: 9, bearingY: 71 })
    expect(glyph.pixels).toHaveLength(52 * 72)
  })

  it('passes the outline to the drawing step', () => {
    const drawCoverage = vi.fn(draw)
    const rasterize = createGlyphRasterizer(
      createRegistry(createFont(boxExtents, 'M1,2L3,4Z')),
      drawCoverage
    )
    rasterize({ fontId: 'inter', glyphId: 5, zoomBucket: 64 })
    expect(drawCoverage.mock.calls[0]?.[1]).toBe('M1,2L3,4Z')
  })

  it('returns an empty bitmap for a glyph with nothing to draw', () => {
    const drawCoverage = vi.fn(draw)
    const rasterize = createGlyphRasterizer(
      createRegistry(createFont({ xBearing: 0, yBearing: 0, width: 0, height: 0 }, '')),
      drawCoverage
    )
    expect(rasterize({ fontId: 'inter', glyphId: 3, zoomBucket: 32 })).toMatchObject({
      width: 0,
      height: 0
    })
    expect(drawCoverage).not.toHaveBeenCalled()
  })

  it('returns an empty bitmap rather than throwing when the font is not loaded', () => {
    const rasterize = createGlyphRasterizer(createRegistry(undefined), draw)
    expect(rasterize({ fontId: 'inter', glyphId: 3, zoomBucket: 32 })).toMatchObject({
      width: 0,
      height: 0
    })
  })
})
