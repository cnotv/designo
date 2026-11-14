import type { DesignDocument, DesignOperation } from '@designo/core'
import { getNodeBounds, unionBounds } from './geometry.ts'
import { createMoveOperations } from './operations.ts'
import { getTopmostIds } from './selection.ts'
import type { AlignKind, Bounds, DistributeAxis, Point } from './types.ts'

const MINIMUM_FOR_ALIGNING = 2
const MINIMUM_FOR_DISTRIBUTING = 3

interface BoxedNode {
  id: string
  bounds: Bounds
}

/**
 * Works out how far a box must move to sit against an edge or centre of a target box.
 * @param bounds - The box to move.
 * @param target - The box to align to.
 * @param kind - Which edge or centre.
 * @returns The distance to move.
 */
export const getAlignDelta = (bounds: Bounds, target: Bounds, kind: AlignKind): Point => {
  const deltaByKind: Record<AlignKind, Point> = {
    left: { x: target.x - bounds.x, y: 0 },
    centerX: { x: target.x + target.width / 2 - (bounds.x + bounds.width / 2), y: 0 },
    right: { x: target.x + target.width - (bounds.x + bounds.width), y: 0 },
    top: { x: 0, y: target.y - bounds.y },
    centerY: { x: 0, y: target.y + target.height / 2 - (bounds.y + bounds.height / 2) },
    bottom: { x: 0, y: target.y + target.height - (bounds.y + bounds.height) }
  }
  return deltaByKind[kind]
}

/**
 * Finds the box a selection aligns to: its own bounds when it holds several nodes, or the frame
 * holding it when it is a single node.
 * @param document - The document.
 * @param nodeIds - The outermost selected nodes.
 * @returns The box, or undefined when a lone node has no frame around it.
 */
export const getAlignTarget = (
  document: DesignDocument,
  nodeIds: readonly string[]
): Bounds | undefined => {
  const nodes = nodeIds.flatMap((nodeId) => document.nodes[nodeId] ?? [])
  if (nodes.length >= MINIMUM_FOR_ALIGNING) return unionBounds(nodes.map(getNodeBounds))
  const parentId = nodes[0]?.parentId
  const parent = parentId ? document.nodes[parentId] : undefined
  return parent?.type === 'frame' ? getNodeBounds(parent) : undefined
}

/**
 * Tells whether the selection can be aligned: two or more nodes, or one inside a frame.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @returns True when align has something to align to.
 */
export const canAlign = (document: DesignDocument, nodeIds: readonly string[]): boolean =>
  getAlignTarget(document, getTopmostIds(document, nodeIds)) !== undefined

/**
 * Tells whether the selection can be distributed.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @returns True for three or more outermost nodes.
 */
export const canDistribute = (document: DesignDocument, nodeIds: readonly string[]): boolean =>
  getTopmostIds(document, nodeIds).length >= MINIMUM_FOR_DISTRIBUTING

/**
 * Builds the moves that align the selection. Frames carry what they hold.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @param kind - Which edge or centre to align.
 * @returns The moves; none when there is nothing to align to or nothing to move.
 */
export const createAlignOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  kind: AlignKind
): DesignOperation[] => {
  const topmostIds = getTopmostIds(document, nodeIds)
  const target = getAlignTarget(document, topmostIds)
  if (!target) return []
  return topmostIds.flatMap((nodeId) => {
    const node = document.nodes[nodeId]
    if (!node) return []
    const delta = getAlignDelta(getNodeBounds(node), target, kind)
    return createMoveOperations(document, [nodeId], delta.x, delta.y)
  })
}

const startOf = (bounds: Bounds, axis: DistributeAxis): number =>
  axis === 'horizontal' ? bounds.x : bounds.y

const sizeOf = (bounds: Bounds, axis: DistributeAxis): number =>
  axis === 'horizontal' ? bounds.width : bounds.height

/**
 * Builds the moves that space the selection evenly: the outermost two stay put and the rest are
 * placed so every gap between neighbours is equal.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @param axis - Along which direction to spread them.
 * @returns The moves; none for fewer than three nodes.
 */
export const createDistributeOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  axis: DistributeAxis
): DesignOperation[] => {
  const nodes: BoxedNode[] = getTopmostIds(document, nodeIds)
    .flatMap((nodeId) => document.nodes[nodeId] ?? [])
    .map((node) => ({ id: node.id, bounds: getNodeBounds(node) }))
    .toSorted((first, second) => startOf(first.bounds, axis) - startOf(second.bounds, axis))
  const [first] = nodes
  const last = nodes.at(-1)
  if (!first || !last || nodes.length < MINIMUM_FOR_DISTRIBUTING) return []
  const span = startOf(last.bounds, axis) + sizeOf(last.bounds, axis) - startOf(first.bounds, axis)
  const occupied = nodes.reduce((sum, node) => sum + sizeOf(node.bounds, axis), 0)
  const gap = (span - occupied) / (nodes.length - 1)
  const precedingSize = (index: number): number =>
    nodes.slice(0, index).reduce((sum, node) => sum + sizeOf(node.bounds, axis), 0)
  return nodes.flatMap((node, index) => {
    const target = startOf(first.bounds, axis) + precedingSize(index) + gap * index
    const distance = target - startOf(node.bounds, axis)
    return createMoveOperations(
      document,
      [node.id],
      axis === 'horizontal' ? distance : 0,
      axis === 'vertical' ? distance : 0
    )
  })
}
