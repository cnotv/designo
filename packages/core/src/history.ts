import { applyOperation, getChildren, getSubtreeIds } from './document.ts'
import { invertCommentOperation, isCommentOperation } from './comments.ts'
import { invertStyleOperation, isStyleOperation, STYLE_LINK_KEYS } from './styles.ts'
import type {
  CommentOperation,
  DesignDocument,
  DocumentMetadata,
  DesignNode,
  DesignNodePatch,
  DesignOperation,
  StyleOperation
} from './types.ts'

// Editing a bound or styled property changes how the node is linked, so undo gives the links back too.
const pickPreviousValues = (node: DesignNode, patch: DesignNodePatch): DesignNodePatch => {
  const linkKeys = STYLE_LINK_KEYS.some((key) => node[key] !== undefined) ? STYLE_LINK_KEYS : []
  return Object.fromEntries(
    [...new Set([...Object.keys(patch), ...linkKeys])].map((key) => [
      key,
      node[key as keyof DesignNodePatch]
    ])
  ) as DesignNodePatch
}

const nodeProperties = (node: DesignNode): DesignNodePatch => {
  const { id: _id, type: _type, parentId: _parentId, order: _order, ...properties } = node
  return properties
}

// Puts back what detaching or resetting changed: the links, and the values the overrides held.
const restoreComponentState = (document: DesignDocument, nodeId: string): DesignOperation[] =>
  getSubtreeIds(document, nodeId).flatMap((id) => {
    const node = document.nodes[id]
    if (!node) return []
    const overridden = Object.fromEntries(
      (node.overrides ?? []).map((key) => [key, node[key as keyof DesignNode]])
    )
    return [
      {
        kind: 'update' as const,
        id,
        patch: { ...overridden, sourceId: node.sourceId, overrides: node.overrides }
      }
    ]
  })

const recreateSubtree = (document: DesignDocument, node: DesignNode): DesignOperation[] => {
  if (node.type === 'page') {
    return [
      { kind: 'createPage', id: node.id, order: node.order, properties: nodeProperties(node) },
      ...getChildren(document, node.id).flatMap((child) => recreateSubtree(document, child))
    ]
  }
  if (node.parentId === null) return []
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

const CREATING_KINDS: readonly string[] = ['create', 'createPage', 'createInstance']
const RESTORING_KINDS: readonly string[] = ['detachInstance', 'resetOverrides']

// Metadata, styles and comments sit beside the nodes, so their undo reads no node.
type OperationBesideNodes = Extract<
  DesignOperation,
  { kind: 'updateMetadata' } | StyleOperation | CommentOperation
>

const isOperationBesideNodes = (operation: DesignOperation): operation is OperationBesideNodes =>
  operation.kind === 'updateMetadata' ||
  isStyleOperation(operation) ||
  isCommentOperation(operation)

const invertOperationBesideNodes = (
  document: DesignDocument,
  operation: OperationBesideNodes
): DesignOperation[] => {
  if (operation.kind === 'updateMetadata') {
    return [
      {
        kind: 'updateMetadata',
        patch: Object.fromEntries(
          Object.keys(operation.patch).map((key) => [
            key,
            document.metadata?.[key as keyof DocumentMetadata] ?? ''
          ])
        )
      }
    ]
  }
  return isStyleOperation(operation)
    ? invertStyleOperation(document, operation)
    : invertCommentOperation(document, operation)
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
  if (isOperationBesideNodes(operation)) return invertOperationBesideNodes(document, operation)
  if (CREATING_KINDS.includes(operation.kind)) return [{ kind: 'delete', id: operation.id }]
  const node = document.nodes[operation.id]
  if (!node) return []
  if (operation.kind === 'update') {
    return [{ kind: 'update', id: node.id, patch: pickPreviousValues(node, operation.patch) }]
  }
  if (operation.kind === 'delete') return recreateSubtree(document, node)
  if (RESTORING_KINDS.includes(operation.kind)) return restoreComponentState(document, node.id)
  if (operation.kind === 'reorderPage') {
    return [{ kind: 'reorderPage', id: node.id, order: node.order }]
  }
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
