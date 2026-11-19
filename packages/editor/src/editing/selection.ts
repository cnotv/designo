import type { DesignDocument, DesignNode } from '@designo/core'
import { boundsIntersect, getNodeBounds } from './geometry.ts'
import { rotatedBoundsContainPoint } from './rotation.ts'
import { getDrawnBounds, searchSpatialEntries } from './spatialIndex.ts'
import type { Bounds, Point, SpatialEntry, SpatialIndex } from './types.ts'

// The index holds only what is drawn and visible: no groups, which have no box of their own yet
// (their size is their children's, which the model does not track, so they are picked through the
// layers panel), and nothing under a hidden node.
const entriesInPaintOrder = (index: SpatialIndex, area: Bounds): SpatialEntry[] =>
  searchSpatialEntries(index, area).toSorted((first, second) => first.order - second.order)

const nodesOf = (document: DesignDocument, entries: readonly SpatialEntry[]): DesignNode[] =>
  entries.flatMap((entry) => {
    const node = document.nodes[entry.id]
    return node ? [node] : []
  })

// Outermost first.
const ancestorIds = (document: DesignDocument, nodeId: string): string[] => {
  const parentId = document.nodes[nodeId]?.parentId
  return parentId ? [...ancestorIds(document, parentId), parentId] : []
}

/**
 * Lists the frames whose bounds clip a node's drawing, outermost first.
 * @param document - The document.
 * @param nodeId - The node.
 * @returns The ancestor frames.
 */
export const getClippingFrames = (document: DesignDocument, nodeId: string): DesignNode[] =>
  ancestorIds(document, nodeId).flatMap((ancestorId) => {
    const ancestor = document.nodes[ancestorId]
    return ancestor?.type === 'frame' ? [ancestor] : []
  })

const nodeContainsPoint = (node: DesignNode, point: Point): boolean =>
  rotatedBoundsContainPoint(getNodeBounds(node), node.rotation, point)

// A point outside a clipping frame shows none of what the frame holds, so it cannot pick it.
const isShownAtPoint = (document: DesignDocument, node: DesignNode, point: Point): boolean =>
  nodeContainsPoint(node, point) &&
  getClippingFrames(document, node.id).every((frame) => nodeContainsPoint(frame, point))

const nodesShownAtPoint = (
  document: DesignDocument,
  index: SpatialIndex,
  point: Point
): DesignNode[] =>
  nodesOf(document, entriesInPaintOrder(index, { ...point, width: 0, height: 0 })).filter((node) =>
    isShownAtPoint(document, node, point)
  )

/**
 * Finds the node drawn on top at a point: the last one in paint order whose box holds it,
 * counting rotation and the frames that clip it. Only the entries near the point are visited.
 * @param document - The document.
 * @param index - The spatial index of that document.
 * @param point - The point in world units.
 * @returns The node, or undefined over empty canvas.
 */
export const findNodeAtPoint = (
  document: DesignDocument,
  index: SpatialIndex,
  point: Point
): DesignNode | undefined => nodesShownAtPoint(document, index, point).at(-1)

/**
 * Finds the frame a new shape drawn at a point should go into: the topmost frame holding it.
 * @param document - The document.
 * @param index - The spatial index of that document.
 * @param point - Where drawing starts, in world units.
 * @returns The frame's id, or the page's id over empty canvas.
 */
export const findContainerAtPoint = (
  document: DesignDocument,
  index: SpatialIndex,
  point: Point
): string =>
  nodesShownAtPoint(document, index, point).findLast((node) => node.type === 'frame')?.id ??
  document.rootId

/**
 * Drops every id whose ancestor is also in the list, so an action on a frame is not applied
 * twice to what it holds.
 * @param document - The document.
 * @param nodeIds - The ids to reduce.
 * @returns The ids with no selected ancestor, in their original order.
 */
export const getTopmostIds = (document: DesignDocument, nodeIds: readonly string[]): string[] => {
  const selected = new Set(nodeIds)
  return nodeIds.filter(
    (nodeId) => !ancestorIds(document, nodeId).some((ancestorId) => selected.has(ancestorId))
  )
}

/**
 * Finds the nodes a marquee touches where they are drawn, rotation and stroke included, keeping
 * only the outermost of each nested set.
 * @param document - The document.
 * @param index - The spatial index of that document.
 * @param marquee - The dragged box in world units.
 * @returns The ids, in paint order.
 */
export const findNodesInBounds = (
  document: DesignDocument,
  index: SpatialIndex,
  marquee: Bounds
): string[] =>
  getTopmostIds(
    document,
    nodesOf(document, entriesInPaintOrder(index, marquee))
      .filter((node) => boundsIntersect(getDrawnBounds(node), marquee))
      .map((node) => node.id)
  )

/**
 * Adds an id to the selection, or removes it when it is already there.
 * @param selection - The current selection.
 * @param nodeId - The id to toggle.
 * @returns The new selection.
 */
export const toggleInSelection = (selection: readonly string[], nodeId: string): string[] =>
  selection.includes(nodeId)
    ? selection.filter((selectedId) => selectedId !== nodeId)
    : [...selection, nodeId]
