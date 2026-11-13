import { getChildren, type DesignDocument, type DesignOperation } from '@designo/core'
import { getTopmostIds } from './selection.ts'
import type { LayerOrderMode } from './types.ts'

interface Slot {
  id: string
  order: number
}

type Stack = readonly Slot[]

const withOrder = (stack: Stack, id: string, order: number): Slot[] =>
  stack
    .map((slot) => (slot.id === id ? { id, order } : slot))
    .toSorted((first, second) => first.order - second.order)

// A node stepping over its neighbour takes the midpoint between that neighbour and the one
// beyond it, so no other order changes.
const stepOver = (
  stack: Stack,
  id: string,
  direction: 1 | -1,
  selected: ReadonlySet<string>
): Stack => {
  const position = stack.findIndex((slot) => slot.id === id)
  const neighbour = stack[position + direction]
  if (!neighbour || selected.has(neighbour.id)) return stack
  const beyond = stack[position + 2 * direction]
  return withOrder(
    stack,
    id,
    (neighbour.order + (beyond?.order ?? neighbour.order + direction)) / 2
  )
}

const sendToEnd = (stack: Stack, id: string, direction: 1 | -1): Stack => {
  const end = direction === 1 ? stack.at(-1) : stack[0]
  if (!end || end.id === id) return stack
  return withOrder(stack, id, end.order + direction)
}

const rearrangeLevel = (
  stack: Stack,
  selectedIds: readonly string[],
  mode: LayerOrderMode
): Stack => {
  const selected = new Set(selectedIds)
  const inStackOrder = stack.filter((slot) => selected.has(slot.id)).map((slot) => slot.id)
  const goesUp = mode === 'forward' || mode === 'front'
  const direction = goesUp ? 1 : -1
  const isStep = mode === 'forward' || mode === 'backward'
  // A step starts with the node nearest its destination so the others queue up behind it; an
  // end move starts with the farthest, so each lands past the last and the order is kept.
  const queue = goesUp === isStep ? inStackOrder.toReversed() : inStackOrder
  return queue.reduce<Stack>(
    (current, id) =>
      isStep ? stepOver(current, id, direction, selected) : sendToEnd(current, id, direction),
    stack
  )
}

/**
 * Builds the moves that change where selected nodes sit among their siblings. A node takes the
 * midpoint of the gap it enters; to front and to back go past the current end by one.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @param mode - One step up or down, or all the way.
 * @returns A move for each node whose order changed.
 */
export const createLayerOrderOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  mode: LayerOrderMode
): DesignOperation[] => {
  const nodes = getTopmostIds(document, nodeIds).flatMap((nodeId) => {
    const node = document.nodes[nodeId]
    return node && node.parentId !== null ? [node] : []
  })
  const parentIds = [...new Set(nodes.map((node) => node.parentId ?? ''))]
  return parentIds.flatMap((parentId) => {
    const before = getChildren(document, parentId).map(({ id, order }) => ({ id, order }))
    const selectedIds = nodes.filter((node) => node.parentId === parentId).map((node) => node.id)
    return rearrangeLevel(before, selectedIds, mode).flatMap((slot) =>
      before.find((old) => old.id === slot.id)?.order === slot.order
        ? []
        : [{ kind: 'move' as const, id: slot.id, parentId, order: slot.order }]
    )
  })
}
