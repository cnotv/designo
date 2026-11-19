import { type DesignDocument, type DesignNode } from '@designo/core'
import type { OperationInput } from '@designo/storage'

const touchedIds = (
  operations: readonly OperationInput[],
  createdNodeIds: readonly string[]
): string[] => [
  ...new Set([
    ...createdNodeIds,
    ...operations.flatMap((operation) =>
      operation.kind === 'update' || operation.kind === 'move' ? [operation.id] : []
    )
  ])
]

const lacksOverlap = (node: DesignNode, frame: DesignNode): boolean =>
  node.x >= frame.x + frame.width ||
  frame.x >= node.x + node.width ||
  node.y >= frame.y + frame.height ||
  frame.y >= node.y + node.height

const describeNode = (node: DesignNode, frame: DesignNode): string =>
  `${node.id} lies completely outside its parent frame ${frame.id} and will not show: it is at (${node.x}, ${node.y}) and the frame covers x ${frame.x} to ${frame.x + frame.width}, y ${frame.y} to ${frame.y + frame.height}. Coordinates are absolute on the page, not relative to the frame.`

/**
 * Finds the nodes a batch created or changed that no longer touch the frame that clips them. A
 * frame draws only what is inside it, so an agent that gave coordinates relative to the frame
 * would otherwise see nothing and get no reason.
 * @param document - The document after the batch.
 * @param operations - The batch that was applied.
 * @param createdNodeIds - The ids the batch created.
 * @returns One sentence per node outside its frame.
 */
export const findOutsideParentWarnings = (
  document: DesignDocument,
  operations: readonly OperationInput[],
  createdNodeIds: readonly string[]
): string[] =>
  touchedIds(operations, createdNodeIds).flatMap((id) => {
    const node = document.nodes[id]
    const parent = node?.parentId ? document.nodes[node.parentId] : undefined
    return node && parent?.type === 'frame' && lacksOverlap(node, parent)
      ? [describeNode(node, parent)]
      : []
  })
