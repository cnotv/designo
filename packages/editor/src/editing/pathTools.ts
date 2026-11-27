import { getPathBox, type DesignOperation } from '@designo/core'
import type { PathDraft, PathTool, PenPoint, Point, Tool } from './types.ts'

/** How close to a path's first point, in screen pixels, a click closes it. */
export const CLOSE_DISTANCE_PX = 8
const MIN_POINTS_TO_CLOSE = 3
const OPEN_PATH_STROKE = '#000000'
const OPEN_PATH_STROKE_WIDTH = 2
const CLOSED_PATH_FILL = '#d9d9d9'

const mirror = (handle: Point, about: Point): Point => ({
  x: 2 * about.x - handle.x,
  y: 2 * about.y - handle.y
})

const formatPoint = (point: Point): string => `${point.x},${point.y}`

// A segment is a curve when either end leaves along a handle; the arriving handle is the far
// point's own, mirrored, so a smooth point passes straight through.
const segment = (from: PenPoint, to: PenPoint): string => {
  if (!from.handleOut && !to.handleOut) return `L${formatPoint(to)}`
  const leave = from.handleOut ?? from
  const arrive = to.handleOut ? mirror(to.handleOut, to) : to
  return `C${formatPoint(leave)} ${formatPoint(arrive)} ${formatPoint(to)}`
}

/**
 * Writes pen points as SVG path data in world coordinates.
 * @param points - The points, in the order they were placed.
 * @param closed - Whether the outline returns to the first point.
 * @returns The path data.
 */
export const getPenPathData = (points: readonly PenPoint[], closed: boolean): string => {
  const [first, ...rest] = points
  if (!first) return ''
  const segments = rest.map((point, index) => segment(points[index] ?? first, point))
  const last = points.at(-1) ?? first
  // A closing curve is needed only when the first point leaves along a handle.
  const closing = closed && first.handleOut ? [segment(last, first)] : []
  return `M${formatPoint(first)}${[...segments, ...closing].join('')}${closed ? 'Z' : ''}`
}

/**
 * Builds the create operation for the path a draft describes, so it can be previewed while the
 * pointer moves and committed when the path is finished.
 * @param draft - The points placed so far.
 * @param options - Whether the path is closed, and a point the pointer is moving to, which ends
 * the outline without being placed yet.
 * @returns The create operation: the node sits at the outline's box, and its path data is
 * relative to it.
 */
export const createPathDraftOperation = (
  draft: PathDraft,
  options: { closed: boolean; pending?: Point }
): DesignOperation => {
  const points = options.pending ? [...draft.points, options.pending] : draft.points
  const box = getPathBox(getPenPathData(points, options.closed))
  return {
    kind: 'create',
    id: draft.nodeId,
    type: 'path',
    parentId: draft.parentId,
    properties: {
      ...box,
      name: draft.tool === 'pen' ? 'Path' : 'Polygon',
      fill: options.closed ? CLOSED_PATH_FILL : null,
      stroke: options.closed ? null : OPEN_PATH_STROKE,
      strokeWidth: OPEN_PATH_STROKE_WIDTH
    }
  }
}

/**
 * Whether a click lands on the first point of a path with enough points to close.
 * @param points - The points placed so far.
 * @param click - The click, in world units.
 * @param scale - Screen pixels per world unit, which keeps the target the same size on screen.
 * @returns True when the click should close the path.
 */
export const isNearFirstPoint = (
  points: readonly PenPoint[],
  click: Point,
  scale: number
): boolean => {
  const [first] = points
  if (!first || points.length < MIN_POINTS_TO_CLOSE) return false
  return Math.hypot(click.x - first.x, click.y - first.y) * scale <= CLOSE_DISTANCE_PX
}

/**
 * Whether a tool draws a path from clicks.
 * @param tool - Any tool.
 * @returns True for the pen and the polygon.
 */
export const isPathTool = (tool: Tool): tool is PathTool => tool === 'pen' || tool === 'polygon'

/**
 * Drops a point that sits exactly on the one before it, which a double click leaves behind,
 * since each of its two clicks places a point.
 * @param points - The points, in the order they were placed.
 * @returns The points without such repeats.
 */
export const removeRepeatedPoints = (points: readonly PenPoint[]): PenPoint[] =>
  points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || previous.x !== point.x || previous.y !== point.y
  })
