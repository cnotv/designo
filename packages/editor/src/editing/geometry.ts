import type { DesignNode } from '@designo/core'
import type { Bounds, Point, ResizeHandle } from './types.ts'

const MIN_SIZE = 1
const TEXT_WIDTH_PER_CHARACTER = 0.56
/** Line spacing as a multiple of the font size, shared by the canvas, the text editor and sizing. */
export const TEXT_LINE_HEIGHT = 1.25

/**
 * Finds where a line of text sits, the way CSS lays out a line box: the font's ascent and descent
 * are centred in the line height. The canvas uses it so its text lines up with the editor's
 * textarea, which CSS lays out.
 * @param lineIndex - Which line, from 0.
 * @param fontSize - The font size.
 * @param fontAscent - The font's ascent at that size, above the baseline.
 * @param fontDescent - The font's descent at that size, below the baseline.
 * @returns The baseline's distance from the top of the text box.
 */
export const getTextBaselineOffset = (
  lineIndex: number,
  fontSize: number,
  fontAscent: number,
  fontDescent: number
): number => {
  const lineHeight = fontSize * TEXT_LINE_HEIGHT
  return lineIndex * lineHeight + (lineHeight - fontAscent - fontDescent) / 2 + fontAscent
}

/**
 * Reads a node's box, ignoring rotation.
 * @param node - The node.
 * @returns Its position and size.
 */
export const getNodeBounds = (node: DesignNode): Bounds => ({
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height
})

/**
 * Makes the box spanned by two corners, whichever way they were dragged.
 * @param first - One corner.
 * @param second - The opposite corner.
 * @returns The box with a positive width and height.
 */
export const boundsFromPoints = (first: Point, second: Point): Bounds => ({
  x: Math.min(first.x, second.x),
  y: Math.min(first.y, second.y),
  width: Math.abs(second.x - first.x),
  height: Math.abs(second.y - first.y)
})

/**
 * Tells whether a point lies inside a box, edges included.
 * @param bounds - The box.
 * @param point - The point.
 * @returns True when the point is inside.
 */
export const containsPoint = (bounds: Bounds, point: Point): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height

/**
 * Tells whether two boxes overlap.
 * @param first - One box.
 * @param second - The other box.
 * @returns True when they share any area or edge.
 */
export const boundsIntersect = (first: Bounds, second: Bounds): boolean =>
  first.x <= second.x + second.width &&
  second.x <= first.x + first.width &&
  first.y <= second.y + second.height &&
  second.y <= first.y + first.height

/**
 * Measures the smallest box around several boxes.
 * @param boxes - The boxes.
 * @returns Their union, or undefined for none.
 */
export const unionBounds = (boxes: readonly Bounds[]): Bounds | undefined => {
  if (boxes.length === 0) return undefined
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const movesLeftEdge = (handle: ResizeHandle): boolean => handle.includes('w')
const movesRightEdge = (handle: ResizeHandle): boolean => handle.includes('e')
const movesTopEdge = (handle: ResizeHandle): boolean => handle.startsWith('n')
const movesBottomEdge = (handle: ResizeHandle): boolean => handle.startsWith('s')

/**
 * Resizes a box by dragging one of its handles. Dragging past the opposite edge flips the box
 * rather than giving it a negative size.
 * @param start - The box when the drag began.
 * @param handle - The handle being dragged.
 * @param deltaX - Horizontal drag distance in world units.
 * @param deltaY - Vertical drag distance in world units.
 * @returns The new box, at least one unit in each direction.
 */
export const resizeBounds = (
  start: Bounds,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number
): Bounds => {
  const left = start.x + (movesLeftEdge(handle) ? deltaX : 0)
  const right = start.x + start.width + (movesRightEdge(handle) ? deltaX : 0)
  const top = start.y + (movesTopEdge(handle) ? deltaY : 0)
  const bottom = start.y + start.height + (movesBottomEdge(handle) ? deltaY : 0)
  const box = boundsFromPoints({ x: left, y: top }, { x: right, y: bottom })
  return { ...box, width: Math.max(MIN_SIZE, box.width), height: Math.max(MIN_SIZE, box.height) }
}

/**
 * Estimates the box a text node needs. Good enough for hit testing and handles until the
 * renderer measures text for real.
 * @param text - The text, lines split by newlines.
 * @param fontSize - Font size in world units.
 * @returns The width and height.
 */
export const estimateTextSize = (
  text: string,
  fontSize: number
): { width: number; height: number } => {
  const lines = text.split('\n')
  const longestLine = Math.max(...lines.map((line) => line.length), 1)
  return {
    width: Math.ceil(longestLine * fontSize * TEXT_WIDTH_PER_CHARACTER),
    height: Math.ceil(lines.length * fontSize * TEXT_LINE_HEIGHT)
  }
}

/**
 * Lists where the eight resize handles sit around a box.
 * @param bounds - The box.
 * @returns Each handle with its centre point.
 */
export const getHandlePositions = (bounds: Bounds): { handle: ResizeHandle; point: Point }[] => {
  const left = bounds.x
  const centerX = bounds.x + bounds.width / 2
  const right = bounds.x + bounds.width
  const top = bounds.y
  const centerY = bounds.y + bounds.height / 2
  const bottom = bounds.y + bounds.height
  return [
    { handle: 'nw', point: { x: left, y: top } },
    { handle: 'n', point: { x: centerX, y: top } },
    { handle: 'ne', point: { x: right, y: top } },
    { handle: 'e', point: { x: right, y: centerY } },
    { handle: 'se', point: { x: right, y: bottom } },
    { handle: 's', point: { x: centerX, y: bottom } },
    { handle: 'sw', point: { x: left, y: bottom } },
    { handle: 'w', point: { x: left, y: centerY } }
  ]
}
