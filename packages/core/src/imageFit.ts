import type { ImageFit } from './types.ts'

/** The rectangle a picture is drawn in, relative to its node's top left corner. */
export interface ImagePlacement {
  x: number
  y: number
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

const HALF = 2

/**
 * Works out where a picture is drawn in an image node's box. `fill` can return a rectangle larger
 * than the box, so the caller clips to the box.
 * @param box - The node's width and height.
 * @param natural - The picture's own size; a picture with no size is stretched.
 * @param fit - How the picture meets the box.
 * @returns The picture's rectangle in the node's own coordinates.
 */
export const getImagePlacement = (box: Size, natural: Size, fit: ImageFit): ImagePlacement => {
  const stretched = { x: 0, y: 0, width: box.width, height: box.height }
  if (fit === 'stretch' || natural.width <= 0 || natural.height <= 0) return stretched
  const scaleX = box.width / natural.width
  const scaleY = box.height / natural.height
  const scale = fit === 'fit' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY)
  const width = natural.width * scale
  const height = natural.height * scale
  return { x: (box.width - width) / HALF, y: (box.height - height) / HALF, width, height }
}
