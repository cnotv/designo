import type { DesignNode } from '@designo/core'
import type { Bounds, Point, Viewport } from './types.ts'

const MIN_SCALE = 0.02
const MAX_SCALE = 64

/**
 * Measures the smallest box holding every given node, ignoring rotation.
 * @param nodes - The nodes to measure.
 * @returns The box, or undefined for an empty list.
 */
export const getContentBounds = (nodes: readonly DesignNode[]): Bounds | undefined => {
  if (nodes.length === 0) return undefined
  const left = Math.min(...nodes.map((node) => node.x))
  const top = Math.min(...nodes.map((node) => node.y))
  const right = Math.max(...nodes.map((node) => node.x + node.width))
  const bottom = Math.max(...nodes.map((node) => node.y + node.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Works out a viewport that centres the content in the canvas with a margin, never zooming past 100%.
 * @param content - The box to show.
 * @param canvasWidth - Canvas width in CSS pixels.
 * @param canvasHeight - Canvas height in CSS pixels.
 * @param margin - Space to keep around the content, in CSS pixels.
 * @returns The viewport.
 */
export const fitViewportToContent = (
  content: Bounds | undefined,
  canvasWidth: number,
  canvasHeight: number,
  margin: number
): Viewport => {
  if (!content || content.width === 0 || content.height === 0) {
    return { offsetX: margin, offsetY: margin, scale: 1 }
  }
  const scale = Math.min(
    1,
    (canvasWidth - margin * 2) / content.width,
    (canvasHeight - margin * 2) / content.height
  )
  return {
    scale,
    offsetX: (canvasWidth - content.width * scale) / 2 - content.x * scale,
    offsetY: (canvasHeight - content.height * scale) / 2 - content.y * scale
  }
}

/**
 * Converts a point on screen, relative to the canvas, to world coordinates.
 * @param viewport - The current pan and zoom.
 * @param screenPoint - The point in CSS pixels.
 * @returns The point in world units.
 */
export const screenToWorld = (viewport: Viewport, screenPoint: Point): Point => ({
  x: (screenPoint.x - viewport.offsetX) / viewport.scale,
  y: (screenPoint.y - viewport.offsetY) / viewport.scale
})

/**
 * Converts a point in world coordinates to a point on screen, relative to the canvas.
 * @param viewport - The current pan and zoom.
 * @param worldPoint - The point in world units.
 * @returns The point in CSS pixels.
 */
export const worldToScreen = (viewport: Viewport, worldPoint: Point): Point => ({
  x: worldPoint.x * viewport.scale + viewport.offsetX,
  y: worldPoint.y * viewport.scale + viewport.offsetY
})

/**
 * Zooms by a factor while keeping the world point under the given screen point still.
 * @param viewport - The current pan and zoom.
 * @param screenPoint - The point to zoom around, in CSS pixels.
 * @param factor - How much to multiply the scale by.
 * @returns The new viewport, with the scale kept between 2% and 6400%.
 */
export const zoomAt = (viewport: Viewport, screenPoint: Point, factor: number): Viewport => {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor))
  const worldPoint = screenToWorld(viewport, screenPoint)
  return {
    scale,
    offsetX: screenPoint.x - worldPoint.x * scale,
    offsetY: screenPoint.y - worldPoint.y * scale
  }
}

/**
 * Moves the view by a distance on screen.
 * @param viewport - The current pan and zoom.
 * @param deltaX - Horizontal distance in CSS pixels.
 * @param deltaY - Vertical distance in CSS pixels.
 * @returns The new viewport.
 */
export const panBy = (viewport: Viewport, deltaX: number, deltaY: number): Viewport => ({
  ...viewport,
  offsetX: viewport.offsetX + deltaX,
  offsetY: viewport.offsetY + deltaY
})
