import { applyOperation, getChildren } from './document.ts'
import type { DesignDocument, DesignNode, DesignNodePatch, DesignOperation } from './types.ts'

const pickPreviousValues = (node: DesignNode, patch: DesignNodePatch): DesignNodePatch =>
  Object.fromEntries(
    Object.keys(patch).map((key) => [key, node[key as keyof DesignNodePatch]])
  ) as DesignNodePatch

const nodeProperties = (node: DesignNode): DesignNodePatch => {
  const { id: _id, type: _type, parentId: _parentId, order: _order, ...properties } = node
  return properties
}

const recreateSubtree = (document: DesignDocument, node: DesignNode): DesignOperation[] => {
  if (node.type === 'page' || node.parentId === null) return []
  return [
    {
      kind: 'create',
      id: node.id,
      type: node.type,
      parentId: node.parentId,
      order: node.order,
      properties: nodeProperties(node)
    },
    ...getChildren(document, node.id).flatMap((child) => recreateSubtree(document, child))
  ]
}

/**
 * Works out the operations that undo one operation, read against the document it applies to.
 * @param document - The document before the operation.
 * @param operation - The operation to undo.
 * @returns The operations that restore the document, in order; empty when there is nothing to undo.
 */
export const invertOperation = (
  document: DesignDocument,
  operation: DesignOperation
): DesignOperation[] => {
  if (operation.kind === 'create') return [{ kind: 'delete', id: operation.id }]
  const node = document.nodes[operation.id]
  if (!node) return []
  if (operation.kind === 'update') {
    return [{ kind: 'update', id: node.id, patch: pickPreviousValues(node, operation.patch) }]
  }
  if (operation.kind === 'delete') return recreateSubtree(document, node)
  if (node.parentId === null) return []
  return [{ kind: 'move', id: node.id, parentId: node.parentId, order: node.order }]
}

/**
 * Works out the operations that undo a whole batch, which run in reverse order of the batch.
 * @param document - The document before the batch.
 * @param operations - The batch to undo, which must apply cleanly to the document.
 * @returns The operations that restore the document.
 */
export const invertOperations = (
  document: DesignDocument,
  operations: readonly DesignOperation[]
): DesignOperation[] =>
  operations
    .reduce<{ document: DesignDocument; inverses: DesignOperation[][] }>(
      (state, operation) => {
        const result = applyOperation(state.document, operation)
        return {
          document: result.ok ? result.document : state.document,
          inverses: [invertOperation(state.document, operation), ...state.inverses]
        }
      },
      { document, inverses: [] }
    )
    .inverses.flat()
