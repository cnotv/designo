import type { GlyphKey } from './types.ts'

const SMALLEST_ZOOM_BUCKET = 8
const LARGEST_ZOOM_BUCKET = 256

/**
 * Picks the size a glyph is drawn at in the atlas: device pixels per em rounded up to a power of
 * two, so zooming redraws a glyph only when the size doubles and the quad scales between.
 * Beyond the largest bucket a glyph is scaled up rather than drawn larger.
 * @param pixelsPerEm - The font size in world units times the zoom times the device pixel ratio.
 * @returns A power of two from 8 to 256.
 */
export const bucketGlyphZoom = (pixelsPerEm: number): number => {
  const bucket = 2 ** Math.ceil(Math.log2(Math.max(pixelsPerEm, Number.MIN_VALUE)))
  return Math.min(LARGEST_ZOOM_BUCKET, Math.max(SMALLEST_ZOOM_BUCKET, bucket))
}

/**
 * Names a glyph by what changes its pixels.
 * @param key - The font, glyph id and zoom bucket.
 * @returns A string for a map.
 */
export const createGlyphCacheKey = (key: GlyphKey): string =>
  `${key.fontId}:${key.glyphId}:${key.zoomBucket}`
