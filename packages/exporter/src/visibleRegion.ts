import type { DesignNode } from '@designo/core'
import type { Bounds } from './types.ts'

const DEGREES_TO_RADIANS = Math.PI / 180
// A mitred stroke corner can reach a few stroke widths past the shape, so this errs on keeping a node.
const STROKE_REACH_FACTOR = 2
// Text is not measured: it is bounded generously (a glyph is rarely wider than 1.5 em) so a node is
// only left out when no line of it could reach the visible region.
const TEXT_ADVANCE_IN_EMS = 1.5
const TEXT_LINE_REACH_IN_EMS = 1.5

const growBounds = (bounds: Bounds, amount: number): Bounds => ({
  x: bounds.x - amount,
  y: bounds.y - amount,
  width: bounds.width + amount * 2,
  height: bounds.height + amount * 2
})

/**
 * Whether two boxes share at least a point. Boxes that only touch count, so a line on an edge stays.
 * @param first - One box.
 * @param second - The other box.
 * @returns True when they overlap or touch.
 */
export const boundsOverlap = (first: Bounds, second: Bounds): boolean =>
  first.x <= second.x + second.width &&
  second.x <= first.x + first.width &&
  first.y <= second.y + second.height &&
  second.y <= first.y + first.height

/**
 * The part two boxes have in common.
 * @param first - One box.
 * @param second - The other box.
 * @returns The shared box, or undefined when they are apart.
 */
export const intersectBounds = (first: Bounds, second: Bounds): Bounds | undefined => {
  const left = Math.max(first.x, second.x)
  const top = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return right < left || bottom < top
    ? undefined
    : { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Expresses a region of the parent's space in the node's own space, where the node's x, y and
 * size mean what they say: undoing the rotation about its centre and boxing the result.
 * @param region - The visible region, in the parent's space.
 * @param node - The node whose space to move into.
 * @returns A box that covers the region as the node's own space sees it.
 */
export const toNodeSpace = (region: Bounds, node: DesignNode): Bounds => {
  if (node.rotation === 0) return region
  const radians = -node.rotation * DEGREES_TO_RADIANS
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const centerX = node.x + node.width / 2
  const centerY = node.y + node.height / 2
  const corners = [
    { x: region.x, y: region.y },
    { x: region.x + region.width, y: region.y },
    { x: region.x, y: region.y + region.height },
    { x: region.x + region.width, y: region.y + region.height }
  ].map((corner) => ({
    x: centerX + (corner.x - centerX) * cosine - (corner.y - centerY) * sine,
    y: centerY + (corner.x - centerX) * sine + (corner.y - centerY) * cosine
  }))
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  }
}

const textBox = (node: DesignNode): Bounds => {
  const lines = node.text.split('\n')
  const longestLine = Math.max(...lines.map((line) => line.length))
  return {
    x: node.x,
    y: node.y,
    width: Math.max(node.width, longestLine * node.fontSize * TEXT_ADVANCE_IN_EMS),
    height: Math.max(node.height, lines.length * node.fontSize * TEXT_LINE_REACH_IN_EMS)
  }
}

/**
 * The box a node can paint in its own space, ignoring rotation (that belongs to the space).
 * @param node - A frame, rectangle, ellipse or text node.
 * @returns A box that covers everything the node draws.
 */
export const getPaintReach = (node: DesignNode): Bounds => {
  const own =
    node.type === 'text'
      ? growBounds(textBox(node), node.fontSize)
      : { x: node.x, y: node.y, width: node.width, height: node.height }
  return node.stroke === null ? own : growBounds(own, node.strokeWidth * STROKE_REACH_FACTOR)
}
