import type { DesignNode } from '@designo/core'
import type { FallbackTextLayout } from '@designo/text'
import type { TextRasterSize } from '../types.ts'

const MIN_RASTER_SCALE = 0.125
const MAX_RASTER_SCALE = 16
const MAX_TEXTURE_SIDE = 4096
// Room for glyphs that lean past the measured advance, such as italics.
const OVERHANG_PADDING = 2

/**
 * Picks how many texture pixels to give each world unit of text: the next power of two at or
 * above what the screen shows, so text stays sharp and zooming reuses a texture until it crosses
 * a power of two.
 * @param devicePixelsPerUnit - Viewport scale times the device pixel ratio.
 * @returns Texture pixels per world unit, between 1/8 and 16.
 */
export const bucketRasterScale = (devicePixelsPerUnit: number): number => {
  const bucket = 2 ** Math.ceil(Math.log2(Math.max(devicePixelsPerUnit, Number.MIN_VALUE)))
  return Math.min(MAX_RASTER_SCALE, Math.max(MIN_RASTER_SCALE, bucket))
}

/**
 * Lowers a raster scale where the texture would pass 4096 pixels a side, the size every GPU takes.
 * @param rasterScale - Texture pixels per world unit.
 * @param size - The raster's size in world units.
 * @returns The scale to rasterise at.
 */
export const capRasterScale = (rasterScale: number, size: TextRasterSize): number =>
  Math.min(
    rasterScale,
    MAX_TEXTURE_SIDE / Math.max(size.width, 1),
    MAX_TEXTURE_SIDE / Math.max(size.height, 1)
  )

/**
 * Measures the area a text node's raster must cover: its box and every line to its far edge, with
 * room for glyphs that lean past it, since text is not clipped to its box.
 * @param layout - The fallback layout of the node's text.
 * @returns The width and height in world units.
 */
export const measureTextRaster = (layout: FallbackTextLayout): TextRasterSize => ({
  width:
    Math.max(layout.width, ...layout.lines.map((line) => line.x + line.width)) + OVERHANG_PADDING,
  height: layout.height
})

/**
 * Names a text raster by everything that changes its pixels, so identical text shares a texture.
 * Only a fixed-width node's width matters, because it is where its lines wrap.
 * @param node - The text node.
 * @param rasterScale - The zoom bucket, from `bucketRasterScale`.
 * @returns The cache key.
 */
export const textRasterKey = (node: DesignNode, rasterScale: number): string =>
  JSON.stringify([
    node.text,
    node.fontFamily,
    node.fontSize,
    node.fill,
    node.textAlign,
    node.lineHeight,
    node.textWrap ? node.width : null,
    rasterScale
  ])
