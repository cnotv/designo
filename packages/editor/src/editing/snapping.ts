import { getChildren, getSubtreeIds, type DesignDocument } from '@designo/core'
import { getNodeBounds, resizeBounds, unionBounds } from './geometry.ts'
import { getTopmostIds } from './selection.ts'
import type {
  Bounds,
  Point,
  ResizeHandle,
  ResizeSnapRequest,
  SnapGuide,
  SnapResult
} from './types.ts'

/** How close, in screen pixels, a dragged edge must come to a line before it snaps to it. */
export const SNAP_THRESHOLD_PX = 6

type Axis = 'x' | 'y'

interface AxisSnap {
  offset: number
  guides: SnapGuide[]
}

const MATCH_TOLERANCE = 0.001
const CENTRE = 0.5
const EDGE_AND_CENTRE_FRACTIONS = [0, CENTRE, 1]

const lineAt = (bounds: Bounds, axis: Axis, fraction: number): number =>
  axis === 'x' ? bounds.x + bounds.width * fraction : bounds.y + bounds.height * fraction

const crossRange = (bounds: Bounds, axis: Axis): [number, number] =>
  axis === 'x' ? [bounds.y, bounds.y + bounds.height] : [bounds.x, bounds.x + bounds.width]

const buildGuide = (
  axis: Axis,
  position: number,
  moved: Bounds,
  matches: readonly Bounds[]
): SnapGuide => {
  const ranges = [moved, ...matches].map((box) => crossRange(box, axis))
  return {
    orientation: axis === 'x' ? 'vertical' : 'horizontal',
    position,
    start: Math.min(...ranges.map(([from]) => from)),
    end: Math.max(...ranges.map(([, to]) => to))
  }
}

const shiftAlong = (bounds: Bounds, axis: Axis, offset: number): Bounds =>
  axis === 'x' ? { ...bounds, x: bounds.x + offset } : { ...bounds, y: bounds.y + offset }

const guidesAfterShift = (
  shifted: Bounds,
  fractions: readonly number[],
  targets: readonly Bounds[],
  axis: Axis
): SnapGuide[] =>
  fractions.flatMap((fraction) => {
    const line = lineAt(shifted, axis, fraction)
    const matches = targets.filter((target) =>
      EDGE_AND_CENTRE_FRACTIONS.some(
        (targetFraction) => Math.abs(lineAt(target, axis, targetFraction) - line) <= MATCH_TOLERANCE
      )
    )
    return matches.length > 0 ? [buildGuide(axis, line, shifted, matches)] : []
  })

// Finds the smallest shift along one axis that puts one of the box's lines (0 start edge, 0.5
// centre, 1 end edge) on a line of a target, within the threshold.
const snapAxis = (
  moving: Bounds,
  fractions: readonly number[],
  targets: readonly Bounds[],
  axis: Axis,
  threshold: number
): AxisSnap | undefined => {
  const offsets = fractions.flatMap((fraction) =>
    targets.flatMap((target) =>
      EDGE_AND_CENTRE_FRACTIONS.map(
        (targetFraction) => lineAt(target, axis, targetFraction) - lineAt(moving, axis, fraction)
      )
    )
  )
  const offset = offsets
    .filter((candidate) => Math.abs(candidate) <= threshold)
    .toSorted((first, second) => Math.abs(first) - Math.abs(second))[0]
  if (offset === undefined) return undefined
  return {
    offset,
    guides: guidesAfterShift(shiftAlong(moving, axis, offset), fractions, targets, axis)
  }
}

/**
 * Lists the boxes a drag snaps to: the visible siblings of the dragged nodes, and the frame
 * holding them.
 * @param document - The document.
 * @param draggedIds - The nodes being dragged.
 * @returns The boxes.
 */
export const getSnapTargets = (
  document: DesignDocument,
  draggedIds: readonly string[]
): Bounds[] => {
  const excluded = new Set(draggedIds.flatMap((nodeId) => getSubtreeIds(document, nodeId)))
  const parentId = document.nodes[draggedIds[0] ?? '']?.parentId
  const parent = parentId ? document.nodes[parentId] : undefined
  if (!parentId || !parent) return []
  const boxes = getChildren(document, parentId)
    .filter((node) => node.visible && node.type !== 'group' && !excluded.has(node.id))
    .map(getNodeBounds)
  return parent.type === 'frame' ? [...boxes, getNodeBounds(parent)] : boxes
}

/**
 * Snaps a move drag: the bounds of the dragged nodes, shifted by the pointer, to the edges and
 * centres of nearby siblings and the frame they sit in.
 * @param document - The document.
 * @param nodeIds - The dragged nodes.
 * @param delta - The pointer distance in world units.
 * @param threshold - The furthest a line may jump, in world units.
 * @returns The distance to apply and the guides to draw.
 */
export const snapMove = (
  document: DesignDocument,
  nodeIds: readonly string[],
  delta: Point,
  threshold: number
): SnapResult => {
  const topmostIds = getTopmostIds(document, nodeIds)
  const start = unionBounds(
    topmostIds.flatMap((nodeId) => document.nodes[nodeId] ?? []).map(getNodeBounds)
  )
  if (!start) return { delta, guides: [] }
  const moved = { ...start, x: start.x + delta.x, y: start.y + delta.y }
  const targets = getSnapTargets(document, topmostIds)
  const horizontal = snapAxis(moved, EDGE_AND_CENTRE_FRACTIONS, targets, 'x', threshold)
  const vertical = snapAxis(moved, EDGE_AND_CENTRE_FRACTIONS, targets, 'y', threshold)
  return {
    delta: { x: delta.x + (horizontal?.offset ?? 0), y: delta.y + (vertical?.offset ?? 0) },
    guides: [...(horizontal?.guides ?? []), ...(vertical?.guides ?? [])]
  }
}

const movingFraction = (handle: ResizeHandle, axis: Axis): number | undefined => {
  const [start, end] = axis === 'x' ? ['w', 'e'] : ['n', 's']
  if (handle.includes(start ?? '')) return 0
  return handle.includes(end ?? '') ? 1 : undefined
}

/**
 * Snaps a resize drag: the edges the handle moves, to the edges and centres of nearby siblings
 * and the frame around.
 * @param document - The document.
 * @param request - The node being resized, its box when the drag began, the handle dragged, the
 * pointer distance in world units, and the furthest an edge may jump in world units.
 * @returns The distance to apply and the guides to draw.
 */
export const snapResize = (
  document: DesignDocument,
  { nodeId, startBounds, handle, delta, threshold }: ResizeSnapRequest
): SnapResult => {
  const targets = getSnapTargets(document, [nodeId])
  const resized = resizeBounds(startBounds, handle, delta.x, delta.y)
  const snapOn = (axis: Axis): AxisSnap | undefined => {
    const fraction = movingFraction(handle, axis)
    return fraction === undefined
      ? undefined
      : snapAxis(resized, [fraction], targets, axis, threshold)
  }
  const horizontal = snapOn('x')
  const vertical = snapOn('y')
  return {
    delta: { x: delta.x + (horizontal?.offset ?? 0), y: delta.y + (vertical?.offset ?? 0) },
    guides: [...(horizontal?.guides ?? []), ...(vertical?.guides ?? [])]
  }
}
