import { planGlyphRaster } from './glyphRasterPlan.ts'
import type {
  CoverageDrawer,
  FontRegistry,
  GlyphKey,
  GlyphRasterizer,
  RasterizedGlyph
} from './types.ts'

const NO_GLYPH: RasterizedGlyph = {
  width: 0,
  height: 0,
  bearingX: 0,
  bearingY: 0,
  pixels: new Uint8Array(0)
}
const RGBA_CHANNELS = 4
const ALPHA_CHANNEL = 3
const GLYPH_FILL = '#ffffff'

/**
 * Draws an outline into 8-bit coverage with the browser's own vector rasteriser: the outline
 * becomes a `Path2D`, filled white on a transparent `OffscreenCanvas`, and the alpha channel is
 * the coverage. The browser anti-aliases the edge, so a glyph is as smooth as any canvas shape.
 * @param plan - The bitmap size and transform.
 * @param pathData - The outline as SVG path data in font units.
 * @returns One byte of coverage per pixel, row by row from the top.
 */
export const drawCoverageOnCanvas: CoverageDrawer = (plan, pathData) => {
  const context = new OffscreenCanvas(plan.width, plan.height).getContext('2d', {
    willReadFrequently: true
  })
  if (!context) return new Uint8Array(plan.width * plan.height)
  context.setTransform(...plan.transform)
  context.fillStyle = GLYPH_FILL
  context.fill(new Path2D(pathData))
  const { data } = context.getImageData(0, 0, plan.width, plan.height)
  return Uint8Array.from(
    { length: plan.width * plan.height },
    (_, pixel) => data[pixel * RGBA_CHANNELS + ALPHA_CHANNEL] ?? 0
  )
}

/**
 * Makes the rasteriser the glyph atlas calls the first time it is asked for a glyph at a zoom
 * bucket. It reads the outline from the font, so a glyph the font lacks gets the font's own
 * missing-glyph shape, and one it cannot draw at all gets an empty bitmap, never an error.
 * @param registry - The fonts, which must be loaded for the glyphs asked for.
 * @param drawCoverage - Fills an outline into coverage; the browser's canvas by default.
 * @returns The rasteriser.
 */
export const createGlyphRasterizer =
  (registry: FontRegistry, drawCoverage: CoverageDrawer = drawCoverageOnCanvas): GlyphRasterizer =>
  (key: GlyphKey): RasterizedGlyph => {
    const font = registry.getFont(key.fontId)
    if (!font) return NO_GLYPH
    const outline = font.getGlyphOutline(key.glyphId)
    const plan = planGlyphRaster(outline.extents, font.metrics.unitsPerEm, key.zoomBucket)
    if (!plan || outline.pathData === '') return NO_GLYPH
    return {
      width: plan.width,
      height: plan.height,
      bearingX: plan.bearingX,
      bearingY: plan.bearingY,
      pixels: drawCoverage(plan, outline.pathData)
    }
  }
