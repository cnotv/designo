import { getPaintOrder, type DesignDocument, type DesignNode } from '@designo/core'
import { boundsIntersect, containsPoint, getNodeBounds } from './geometry.ts'
import type { Bounds, Point } from './types.ts'

// Groups have no box of their own yet: their size is their children's, which the model does not
// track, so they are picked through the layers panel rather than on the canvas.
const isPickable = (node: DesignNode): boolean => node.type !== 'page' && node.type !== 'group'

/**
 * Finds the node drawn on top at a point: the last one in paint order whose box holds it.
 * @param document - The document.
 * @param point - The point in world units.
 * @returns The node, or undefined over empty canvas.
 */
export const findNodeAtPoint = (document: DesignDocument, point: Point): DesignNode | undefined =>
  getPaintOrder(document)
    .filter(isPickable)
    .findLast((node) => containsPoint(getNodeBounds(node), point))

/**
 * Finds the frame a new shape drawn at a point should go into: the topmost frame holding it.
 * @param document - The document.
 * @param point - Where drawing starts, in world units.
 * @returns The frame's id, or the page's id over empty canvas.
 */
export const findContainerAtPoint = (document: DesignDocument, point: Point): string =>
  getPaintOrder(document)
    .filter((node) => node.type === 'frame')
    .findLast((node) => containsPoint(getNodeBounds(node), point))?.id ?? document.rootId

const ancestorIds = (document: DesignDocument, nodeId: string): string[] => {
  const parentId = document.nodes[nodeId]?.parentId
  return parentId ? [parentId, ...ancestorIds(document, parentId)] : []
}

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
 * Finds the nodes a marquee touches, keeping only the outermost of each nested set.
 * @param document - The document.
 * @param marquee - The dragged box in world units.
 * @returns The ids, in paint order.
 */
export const findNodesInBounds = (document: DesignDocument, marquee: Bounds): string[] =>
  getTopmostIds(
    document,
    getPaintOrder(document)
      .filter((node) => isPickable(node) && boundsIntersect(getNodeBounds(node), marquee))
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
