import type { GlyphExtents, GlyphRasterPlan } from '@designo/text'

// One pixel on each side keeps the anti-aliased edge of a stroke that lands on a pixel boundary.
const EDGE_MARGIN_PIXELS = 1

/**
 * Works out the bitmap a glyph is drawn into. The box is cut on whole pixels, so the bitmap's
 * pixels line up with the outline whatever the glyph's own position, and the quad that shows it
 * can sit anywhere without a seam.
 * @param extents - The glyph's bounding box in font units, with y up and a negative height.
 * @param unitsPerEm - The font's units per em.
 * @param zoomBucket - Device pixels per em the glyph is drawn at.
 * @returns The plan, or undefined for a glyph with nothing to draw, such as a space.
 */
export const planGlyphRaster = (
  extents: GlyphExtents | undefined,
  unitsPerEm: number,
  zoomBucket: number
): GlyphRasterPlan | undefined => {
  if (!extents || extents.width === 0 || extents.height === 0) return undefined
  const scale = zoomBucket / unitsPerEm
  const topFontUnit = Math.max(extents.yBearing, extents.yBearing + extents.height)
  const bottomFontUnit = Math.min(extents.yBearing, extents.yBearing + extents.height)
  const left = Math.floor(extents.xBearing * scale) - EDGE_MARGIN_PIXELS
  const right = Math.ceil((extents.xBearing + extents.width) * scale) + EDGE_MARGIN_PIXELS
  const top = Math.ceil(topFontUnit * scale) + EDGE_MARGIN_PIXELS
  const bottom = Math.floor(bottomFontUnit * scale) - EDGE_MARGIN_PIXELS
  return {
    width: right - left,
    height: top - bottom,
    scale,
    bearingX: left,
    bearingY: top,
    transform: [scale, 0, 0, -scale, -left, top]
  }
}
