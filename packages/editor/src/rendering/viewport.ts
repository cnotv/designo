import type { DesignNode } from '@designo/core'
import type { Bounds, Viewport } from './types.ts'

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
