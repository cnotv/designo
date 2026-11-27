import {
  getPathBox,
  getPathContours,
  getWorldOutline,
  insertPathAnchor,
  smoothPathAnchor,
  writePathContours,
  type DesignNode,
  type DesignOperation,
  type PathAnchor,
  type PathContour,
  type PathPoint
} from '@designo/core'
import type { PathEditHandle, PathEditTarget, Point } from './types.ts'

/** How close, in screen pixels, a pointer must be to grab an anchor or a handle. */
export const PATH_GRAB_RADIUS_PX = 8

type AnchorAddress = Pick<PathEditTarget, 'contour' | 'index'>

const toWorld = (node: DesignNode, point: PathPoint): Point => ({
  x: node.x + point.x,
  y: node.y + point.y
})

/**
 * Lists the points a person can grab on a path being edited: every anchor, and the two bezier
 * handles of the selected one.
 * @param node - The path node, not turned (editing starts by baking a turn into the outline).
 * @param selected - The anchor whose handles are shown.
 * @returns The grab points in world units, handles after the anchors so they win a tie.
 */
export const getPathEditHandles = (
  node: DesignNode,
  selected: AnchorAddress | undefined
): PathEditHandle[] => {
  const contours = getPathContours(node.pathData)
  const anchors = contours.flatMap((contour, contourIndex) =>
    contour.anchors.map((anchor, index): PathEditHandle => ({
      contour: contourIndex,
      index,
      part: 'anchor',
      point: toWorld(node, anchor)
    }))
  )
  const anchor = selected && contours[selected.contour]?.anchors[selected.index]
  if (!selected || !anchor) return anchors
  const handles = (['handleIn', 'handleOut'] as const).flatMap((part) => {
    const handle = anchor[part]
    return handle
      ? [
          {
            ...selected,
            part,
            point: toWorld(node, { x: anchor.x + handle.x, y: anchor.y + handle.y })
          }
        ]
      : []
  })
  return [...anchors, ...handles]
}

/**
 * Finds the anchor or handle under a point.
 * @param handles - The grab points from `getPathEditHandles`.
 * @param world - The pointer, in world units.
 * @param scale - Screen pixels per world unit, which keeps the target the same size on screen.
 * @returns The nearest part within reach; a handle over the anchor it sits on wins.
 */
export const findPathEditTarget = (
  handles: readonly PathEditHandle[],
  world: Point,
  scale: number
): PathEditTarget | undefined => {
  const reach = PATH_GRAB_RADIUS_PX / scale
  const near = handles
    .map((handle) => ({
      handle,
      distance: Math.hypot(handle.point.x - world.x, handle.point.y - world.y)
    }))
    .filter(({ distance }) => distance <= reach)
  const [best] = near.toSorted((first, second) => {
    const firstRank = first.handle.part === 'anchor' ? 1 : 0
    const secondRank = second.handle.part === 'anchor' ? 1 : 0
    return firstRank - secondRank || first.distance - second.distance
  })
  return best && { contour: best.handle.contour, index: best.handle.index, part: best.handle.part }
}

// The outline is stored in its node's box, so an edit works in world units and the box is fitted
// to the result: the node moves and resizes so its outline starts at its corner.
const toUpdate = (node: DesignNode, contours: readonly PathContour[]): DesignOperation[] => {
  if (contours.length === 0) return [{ kind: 'delete', id: node.id }]
  const world = contours.map((contour) => ({
    ...contour,
    anchors: contour.anchors.map((anchor) => ({ ...anchor, ...toWorld(node, anchor) }))
  }))
  return [{ kind: 'update', id: node.id, patch: getPathBox(writePathContours(world)) }]
}

const replaceAnchor = (
  contours: readonly PathContour[],
  { contour, index }: AnchorAddress,
  replace: (anchor: PathAnchor) => PathAnchor
): PathContour[] =>
  contours.map((entry, contourIndex) =>
    contourIndex === contour
      ? {
          ...entry,
          anchors: entry.anchors.map((anchor, i) => (i === index ? replace(anchor) : anchor))
        }
      : entry
  )

// A smooth point keeps its handles on one line through it, so dragging one turns the other,
// whose length stays.
const mirrorOpposite = (
  moved: PathPoint,
  opposite: PathPoint | null,
  wasSmooth: boolean
): PathPoint | null => {
  const length = Math.hypot(moved.x, moved.y)
  if (!opposite || !wasSmooth || length === 0) return opposite
  const oppositeLength = Math.hypot(opposite.x, opposite.y)
  return { x: (-moved.x / length) * oppositeLength, y: (-moved.y / length) * oppositeLength }
}

const SMOOTH_TOLERANCE = 1e-6

const isSmooth = (anchor: PathAnchor): boolean =>
  !!anchor.handleIn &&
  !!anchor.handleOut &&
  Math.abs(anchor.handleIn.x * anchor.handleOut.y - anchor.handleIn.y * anchor.handleOut.x) <=
    SMOOTH_TOLERANCE *
      Math.hypot(anchor.handleIn.x, anchor.handleIn.y) *
      Math.hypot(anchor.handleOut.x, anchor.handleOut.y) +
      SMOOTH_TOLERANCE

/**
 * Builds the update that drags an anchor or one of its handles to a point.
 * @param node - The path node.
 * @param target - What is held.
 * @param world - Where the pointer is, in world units.
 * @returns One update, which also refits the node's box to the outline.
 */
export const createMoveTargetOperations = (
  node: DesignNode,
  target: PathEditTarget,
  world: Point
): DesignOperation[] => {
  const local = { x: world.x - node.x, y: world.y - node.y }
  const contours = replaceAnchor(getPathContours(node.pathData), target, (anchor) => {
    if (target.part === 'anchor') return { ...anchor, ...local }
    const handle = { x: local.x - anchor.x, y: local.y - anchor.y }
    const smooth = isSmooth(anchor)
    return target.part === 'handleOut'
      ? { ...anchor, handleOut: handle, handleIn: mirrorOpposite(handle, anchor.handleIn, smooth) }
      : { ...anchor, handleIn: handle, handleOut: mirrorOpposite(handle, anchor.handleOut, smooth) }
  })
  return toUpdate(node, contours)
}

const MIN_ANCHORS = 2

/**
 * Builds the removal of an anchor; the outline closes over the gap. A contour left with fewer
 * than two anchors goes, and so does the node when nothing remains.
 * @param node - The path node.
 * @param address - The anchor.
 * @returns The update, or a delete of the node.
 */
export const createRemoveAnchorOperations = (
  node: DesignNode,
  { contour, index }: AnchorAddress
): DesignOperation[] => {
  const contours = getPathContours(node.pathData)
    .map((entry, contourIndex) =>
      contourIndex === contour
        ? { ...entry, anchors: entry.anchors.filter((_, i) => i !== index) }
        : entry
    )
    .filter((entry) => entry.anchors.length >= MIN_ANCHORS)
  return toUpdate(node, contours)
}

/**
 * Builds the addition of an anchor on the outline at a point, keeping the curve's shape.
 * @param node - The path node.
 * @param world - Where the person clicked, in world units.
 * @param tolerance - How far from the outline the click may be, in world units.
 * @returns The update and the new anchor, or undefined when the click is off the outline.
 */
export const createAddAnchorOperations = (
  node: DesignNode,
  world: Point,
  tolerance: number
): { operations: DesignOperation[]; target: AnchorAddress } | undefined => {
  const inserted = insertPathAnchor(
    node.pathData,
    { x: world.x - node.x, y: world.y - node.y },
    tolerance
  )
  if (!inserted) return undefined
  return {
    operations: toUpdate(
      { ...node, pathData: inserted.pathData },
      getPathContours(inserted.pathData)
    ),
    target: { contour: inserted.contour, index: inserted.index }
  }
}

/**
 * Builds the switch of an anchor between a corner and a smooth point.
 * @param node - The path node.
 * @param address - The anchor.
 * @returns The update.
 */
export const createToggleAnchorOperations = (
  node: DesignNode,
  address: AnchorAddress
): DesignOperation[] => {
  const contours = getPathContours(node.pathData)
  const anchor = contours[address.contour]?.anchors[address.index]
  if (!anchor) return []
  const next =
    anchor.handleIn || anchor.handleOut
      ? replaceAnchor(contours, address, (current) => ({
          ...current,
          handleIn: null,
          handleOut: null
        }))
      : smoothPathAnchor(contours, address.contour, address.index)
  return toUpdate(node, next)
}

/**
 * Builds the update that turns a node's rotation into its outline, so its anchors can be edited
 * in the page's own axes. Nothing for a path that is not turned.
 * @param node - The path node.
 * @returns The update, or none.
 */
export const createBakeRotationOperations = (node: DesignNode): DesignOperation[] =>
  node.rotation === 0
    ? []
    : [
        {
          kind: 'update',
          id: node.id,
          patch: { ...getPathBox(getWorldOutline(node)), rotation: 0 }
        }
      ]
