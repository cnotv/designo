import { getPaintOrder, type DesignDocument, type DesignNode } from '@designo/core'
import { boundsIntersect, getNodeBounds, unionBounds } from './geometry.ts'
import { getRotatedCorners } from './rotation.ts'
import type { Bounds, SpatialEntry, SpatialIndex, SpatialTreeNode } from './types.ts'

// Sixteen per node keeps the tree three or four levels deep for tens of thousands of layers.
const NODE_CAPACITY = 16

const EMPTY_BOUNDS: Bounds = { x: 0, y: 0, width: 0, height: 0 }

const centerX = (bounds: Bounds): number => bounds.x + bounds.width / 2
const centerY = (bounds: Bounds): number => bounds.y + bounds.height / 2

const chunk = <Item>(items: readonly Item[], size: number): Item[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, position) =>
    items.slice(position * size, (position + 1) * size)
  )

const boundsOf = (items: readonly { bounds: Bounds }[]): Bounds =>
  unionBounds(items.map((item) => item.bounds)) ?? EMPTY_BOUNDS

// Sort-Tile-Recursive packing: vertical slices by x, then runs by y inside each slice, so every
// node covers a compact, mostly non-overlapping area.
const tile = <Item extends { bounds: Bounds }>(items: readonly Item[]): Item[][] => {
  const groupCount = Math.ceil(items.length / NODE_CAPACITY)
  const sliceSize = Math.ceil(Math.sqrt(groupCount)) * NODE_CAPACITY
  const byX = items.toSorted((first, second) => centerX(first.bounds) - centerX(second.bounds))
  return chunk(byX, sliceSize).flatMap((slice) =>
    chunk(
      slice.toSorted((first, second) => centerY(first.bounds) - centerY(second.bounds)),
      NODE_CAPACITY
    )
  )
}

const packLevel = (
  nodes: readonly SpatialTreeNode[],
  depth: number
): { root: SpatialTreeNode; depth: number } => {
  if (nodes.length === 1 && nodes[0]) return { root: nodes[0], depth }
  const parents = tile(nodes).map((children) => ({
    bounds: boundsOf(children),
    children,
    entries: []
  }))
  return packLevel(parents, depth + 1)
}

/**
 * Builds a spatial index over entries, packed in one pass. Rebuilding is cheaper than updating
 * for a document that is replaced, not changed in place, on every edit.
 * @param entries - The entries with their bounds.
 * @returns The index.
 */
export const createSpatialIndex = (entries: readonly SpatialEntry[]): SpatialIndex => {
  if (entries.length === 0) return { root: undefined, depth: 0, size: 0 }
  const leaves = tile(entries).map((group) => ({
    bounds: boundsOf(group),
    children: [],
    entries: group
  }))
  const { root, depth } = packLevel(leaves, 1)
  return { root, depth, size: entries.length }
}

const searchNode = (node: SpatialTreeNode, area: Bounds): SpatialEntry[] => {
  if (!boundsIntersect(node.bounds, area)) return []
  const matchingEntries = node.entries.filter((entry) => boundsIntersect(entry.bounds, area))
  return [...matchingEntries, ...node.children.flatMap((child) => searchNode(child, area))]
}

/**
 * Finds the entries whose bounds touch an area, edges included, without visiting the subtrees
 * that lie wholly outside it.
 * @param index - The index.
 * @param area - The area to search, in world units.
 * @returns The entries found, in no particular order.
 */
export const searchSpatialEntries = (index: SpatialIndex, area: Bounds): SpatialEntry[] =>
  index.root ? searchNode(index.root, area) : []

/**
 * Finds the entries whose bounds touch an area, edges included, without visiting the subtrees
 * that lie wholly outside it.
 * @param index - The index.
 * @param area - The area to search, in world units.
 * @returns The ids of the entries found, in no particular order.
 */
export const searchSpatialIndex = (index: SpatialIndex, area: Bounds): string[] =>
  searchSpatialEntries(index, area).map((entry) => entry.id)

/**
 * Measures where a node is drawn: its box turned by its rotation, plus the half of its stroke that
 * falls outside the box.
 * @param node - The node.
 * @returns The axis-aligned box around everything it draws.
 */
export const getDrawnBounds = (node: DesignNode): Bounds => {
  const corners = getRotatedCorners(getNodeBounds(node), node.rotation)
  const halfStroke = node.stroke && node.strokeWidth > 0 ? node.strokeWidth / 2 : 0
  const left = Math.min(...corners.map((corner) => corner.x)) - halfStroke
  const top = Math.min(...corners.map((corner) => corner.y)) - halfStroke
  const right = Math.max(...corners.map((corner) => corner.x)) + halfStroke
  const bottom = Math.max(...corners.map((corner) => corner.y)) + halfStroke
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Indexes everything a document draws: visible shapes, frames and text, not pages or groups, which
 * have no drawing of their own.
 * @param document - The document.
 * @returns The index, keyed by node id.
 */
export const indexDocument = (document: DesignDocument): SpatialIndex =>
  createSpatialIndex(
    getPaintOrder(document)
      .filter((node) => node.type !== 'group' && node.type !== 'page')
      .map((node, order) => ({ id: node.id, bounds: getDrawnBounds(node), order }))
  )
