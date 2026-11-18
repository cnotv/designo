import { createAtlasPagePool } from './atlasPages.ts'
import { createGlyphCacheKey } from './glyphAtlasKeys.ts'
import type {
  AtlasGlyph,
  AtlasRectangle,
  AtlasUpload,
  GlyphAtlas,
  GlyphAtlasOptions,
  GlyphKey,
  RasterizedGlyph
} from './types.ts'

const EMPTY_RECTANGLE: AtlasRectangle = { x: 0, y: 0, width: 0, height: 0 }
const NO_PAGE = -1

const assertPixelsMatchSize = (glyph: RasterizedGlyph): void => {
  if (glyph.pixels.length !== glyph.width * glyph.height) {
    throw new Error(`Glyph has ${glyph.pixels.length} pixels for ${glyph.width} by ${glyph.height}`)
  }
}

const hasNothingToDraw = (glyph: RasterizedGlyph): boolean =>
  glyph.width === 0 || glyph.height === 0

/**
 * Makes the shared glyph atlas: a cache of glyph bitmaps packed into fixed-size pages. It works
 * on rectangles and ids only, so the renderer supplies the drawing of an outline into pixels and
 * does the texture uploads, and none of it needs a GL context.
 *
 * When the pages are full, the one unused longest is cleared and its glyphs are drawn again on
 * demand; see `createAtlasPagePool`.
 * @param options - The page size, how many pages, the padding and the rasteriser.
 * @returns The atlas.
 */
export const createGlyphAtlas = (options: GlyphAtlasOptions): GlyphAtlas => {
  const { pageWidth, pageHeight, maxPages, padding, rasterizeGlyph } = options
  const pool = createAtlasPagePool({ pageWidth, pageHeight, maxPages })
  const glyphs = new Map<string, AtlasGlyph>()
  const state = { uploads: [] as AtlasUpload[], clearedPages: [] as number[] }

  const forgetPage = (pageIndex: number, glyphIds: readonly string[]): void => {
    glyphIds.forEach((glyphId) => glyphs.delete(glyphId))
    // Pixels waiting for the cleared page belong to glyphs that no longer exist.
    state.uploads = state.uploads.filter((upload) => upload.pageIndex !== pageIndex)
    state.clearedPages.push(pageIndex)
  }

  const storeGlyph = (key: GlyphKey, raster: RasterizedGlyph): AtlasGlyph | undefined => {
    const placement = pool.place(raster.width + padding * 2, raster.height + padding * 2)
    if (!placement) return undefined
    if (placement.evicted) forgetPage(placement.evicted.pageIndex, placement.evicted.glyphIds)
    const rectangle: AtlasRectangle = {
      x: placement.rectangle.x + padding,
      y: placement.rectangle.y + padding,
      width: raster.width,
      height: raster.height
    }
    const glyph: AtlasGlyph = {
      pageIndex: placement.pageIndex,
      rectangle,
      bearingX: raster.bearingX,
      bearingY: raster.bearingY,
      isEmpty: false
    }
    const cacheKey = createGlyphCacheKey(key)
    glyphs.set(cacheKey, glyph)
    pool.addGlyph(placement.pageIndex, cacheKey)
    state.uploads.push({ pageIndex: placement.pageIndex, rectangle, pixels: raster.pixels })
    return glyph
  }

  const storeEmptyGlyph = (key: GlyphKey, raster: RasterizedGlyph): AtlasGlyph => {
    const empty: AtlasGlyph = {
      pageIndex: NO_PAGE,
      rectangle: EMPTY_RECTANGLE,
      bearingX: raster.bearingX,
      bearingY: raster.bearingY,
      isEmpty: true
    }
    glyphs.set(createGlyphCacheKey(key), empty)
    return empty
  }

  const lookupGlyph = (key: GlyphKey): AtlasGlyph | undefined => {
    const cached = glyphs.get(createGlyphCacheKey(key))
    if (cached) {
      pool.markUsed(cached.pageIndex)
      return cached
    }
    const raster = rasterizeGlyph(key)
    assertPixelsMatchSize(raster)
    return hasNothingToDraw(raster) ? storeEmptyGlyph(key, raster) : storeGlyph(key, raster)
  }

  return {
    pageWidth,
    pageHeight,
    beginFrame: pool.beginFrame,
    lookupGlyph,
    takePendingUploads: () => state.uploads.splice(0),
    takeClearedPages: () => state.clearedPages.splice(0),
    getPageCount: pool.getPageCount,
    getGlyphCount: () => glyphs.size
  }
}
