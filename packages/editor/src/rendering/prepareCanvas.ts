import type { CanvasSize } from './types.ts'

/**
 * Sizes a canvas's backing store to its CSS size times the pixel ratio. Assigning a size clears
 * the canvas and, for WebGL, reallocates its buffers, so it only happens when the size changes.
 * @param canvas - The canvas.
 * @param size - Its size in CSS pixels.
 * @param pixelRatio - Device pixels per CSS pixel.
 * @returns The backing store size in device pixels.
 */
export const prepareCanvas = (
  canvas: HTMLCanvasElement,
  size: CanvasSize,
  pixelRatio: number
): CanvasSize => {
  const width = Math.round(size.width * pixelRatio)
  const height = Math.round(size.height * pixelRatio)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  return { width, height }
}
