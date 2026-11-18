import { describe, expect, it } from 'vitest'
import { planGlyphRaster } from './glyphRasterPlan.ts'

// HarfBuzz reports a glyph's top as a positive bearing and its height as a negative number.
const extents = { xBearing: 180, yBearing: 1490, width: 1162, height: -1490 }

describe('planGlyphRaster', () => {
  it('has nothing to draw for a glyph without extents or with an empty box', () => {
    expect(planGlyphRaster(undefined, 2048, 32)).toBeUndefined()
    expect(
      planGlyphRaster({ xBearing: 0, yBearing: 0, width: 0, height: 0 }, 2048, 32)
    ).toBeUndefined()
  })

  it('scales font units to the bucket: one em is the bucket in pixels', () => {
    const plan = planGlyphRaster(extents, 2048, 2048)
    // One pixel per font unit, plus the margin on every side.
    expect(plan).toMatchObject({ scale: 1, bearingX: 179, bearingY: 1491 })
  })

  it('covers the outline with a pixel of margin, from whole pixels so it lands where it was drawn', () => {
    const plan = planGlyphRaster(extents, 2048, 64)
    const scale = 64 / 2048
    expect(plan?.scale).toBe(scale)
    const left = Math.floor(180 * scale) - 1
    const right = Math.ceil((180 + 1162) * scale) + 1
    const top = Math.ceil(1490 * scale) + 1
    const bottom = Math.floor(0 * scale) - 1
    expect(plan).toMatchObject({
      bearingX: left,
      bearingY: top,
      width: right - left,
      height: top - bottom
    })
  })

  it('maps font units to bitmap pixels with y flipped, so the baseline is bearingY down', () => {
    const plan = planGlyphRaster(extents, 2048, 128)
    expect(plan).toBeDefined()
    if (!plan) return
    const [a, b, c, d, e, f] = plan.transform
    expect([a, b, c, d]).toEqual([plan.scale, 0, 0, -plan.scale])
    // A point on the baseline at the left of the bitmap's origin column.
    expect(e).toBe(-plan.bearingX)
    expect(f).toBe(plan.bearingY)
  })

  it('draws the same outline larger in a bigger bucket', () => {
    const small = planGlyphRaster(extents, 2048, 16)
    const large = planGlyphRaster(extents, 2048, 128)
    expect(large?.width ?? 0).toBeGreaterThan((small?.width ?? 0) * 4)
  })
})
