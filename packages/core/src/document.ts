import { CONTAINER_NODE_TYPES, DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import type {
  DesignDocument,
  DesignNode,
  DesignNodeTree,
  DesignOperation,
  OperationResult
} from './types.ts'

/**
 * Creates an empty document holding a single page.
 * @param documentId - Id of the new document.
 * @param documentName - Display name of the document.
 * @param pageId - Id of the root page node.
 * @returns The new document.
 */
export const createDocument = (
  documentId: string,
  documentName: string,
  pageId: string
): DesignDocument => ({
  formatVersion: 1,
  id: documentId,
  name: documentName,
  rootId: pageId,
  nodes: {
    [pageId]: {
      ...DEFAULT_NODE_PROPERTIES,
      id: pageId,
      type: 'page',
      name: 'Page 1',
      parentId: null,
      order: 0,
      fill: null,
      width: 0,
      height: 0
    }
  }
})

/**
 * Lists the direct children of a node, in paint order (back to front).
 * @param document - The document to read.
 * @param parentId - Id of the parent node.
 * @returns The children, sorted by order.
 */
export const getChildren = (document: DesignDocument, parentId: string): DesignNode[] =>
  Object.values(document.nodes)
    .filter((node) => node.parentId === parentId)
    .toSorted((first, second) => first.order - second.order)

/**
 * Collects a node and every node beneath it.
 * @param document - The document to read.
 * @param nodeId - Id of the subtree's root.
 * @returns Ids of the node and all its descendants.
 */
export const getSubtreeIds = (document: DesignDocument, nodeId: string): string[] => [
  nodeId,
  ...getChildren(document, nodeId).flatMap((child) => getSubtreeIds(document, child.id))
]

/**
 * Builds the nested tree under a node, cut off below a given depth.
 * @param document - The document to read.
 * @param nodeId - Id of the tree's root.
 * @param depth - How many levels of children to include; 0 returns the node alone.
 * @returns The tree, or undefined when the node does not exist.
 */
export const getNodeTree = (
  document: DesignDocument,
  nodeId: string,
  depth: number
): DesignNodeTree | undefined => {
  const node = document.nodes[nodeId]
  if (!node) return undefined
  const children =
    depth <= 0
      ? []
      : getChildren(document, nodeId).flatMap((child) => {
          const childTree = getNodeTree(document, child.id, depth - 1)
          return childTree ? [childTree] : []
        })
  return { node, children }
}

const isContainer = (node: DesignNode): boolean =>
  (CONTAINER_NODE_TYPES as readonly string[]).includes(node.type)

const nextSiblingOrder = (document: DesignDocument, parentId: string): number => {
  const siblings = getChildren(document, parentId)
  const lastSibling = siblings.at(-1)
  return lastSibling ? lastSibling.order + 1 : 0
}

const withNodes = (
  document: DesignDocument,
  nodes: Record<string, DesignNode>
): OperationResult => ({ ok: true, document: { ...document, nodes } })

const failure = (error: string): OperationResult => ({ ok: false, error })

const checkParent = (document: DesignDocument, parentId: string): string | undefined => {
  const parent = document.nodes[parentId]
  if (!parent) return `Parent ${parentId} does not exist`
  if (!isContainer(parent))
    return `Parent ${parentId} is a ${parent.type}, which cannot hold children`
  return undefined
}

const applyCreate = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'create' }>
): OperationResult => {
  if (document.nodes[operation.id]) return failure(`Node ${operation.id} already exists`)
  const parentProblem = checkParent(document, operation.parentId)
  if (parentProblem) return failure(parentProblem)
  const node: DesignNode = {
    ...DEFAULT_NODE_PROPERTIES,
    name: operation.type,
    ...operation.properties,
    id: operation.id,
    type: operation.type,
    parentId: operation.parentId,
    order: operation.order ?? nextSiblingOrder(document, operation.parentId)
  }
  return withNodes(document, { ...document.nodes, [operation.id]: node })
}

const applyUpdate = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'update' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (!node) return failure(`Node ${operation.id} does not exist`)
  return withNodes(document, { ...document.nodes, [operation.id]: { ...node, ...operation.patch } })
}

const applyDelete = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'delete' }>
): OperationResult => {
  if (!document.nodes[operation.id]) return failure(`Node ${operation.id} does not exist`)
  if (operation.id === document.rootId) return failure('The root page cannot be deleted')
  const removedIds = new Set(getSubtreeIds(document, operation.id))
  const remainingNodes = Object.fromEntries(
    Object.entries(document.nodes).filter(([nodeId]) => !removedIds.has(nodeId))
  )
  return withNodes(document, remainingNodes)
}

const applyMove = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'move' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (!node) return failure(`Node ${operation.id} does not exist`)
  const parentProblem = checkParent(document, operation.parentId)
  if (parentProblem) return failure(parentProblem)
  if (getSubtreeIds(document, operation.id).includes(operation.parentId)) {
    return failure(`Node ${operation.id} cannot move inside itself`)
  }
  const movedNode: DesignNode = {
    ...node,
    parentId: operation.parentId,
    order: operation.order ?? nextSiblingOrder(document, operation.parentId)
  }
  return withNodes(document, { ...document.nodes, [operation.id]: movedNode })
}

/**
 * Applies one operation without changing the input document.
 * @param document - The document before the operation.
 * @param operation - The change to make.
 * @returns The new document, or the reason the operation was refused.
 */
export const applyOperation = (
  document: DesignDocument,
  operation: DesignOperation
): OperationResult => {
  if (operation.kind === 'create') return applyCreate(document, operation)
  if (operation.kind === 'update') return applyUpdate(document, operation)
  if (operation.kind === 'delete') return applyDelete(document, operation)
  return applyMove(document, operation)
}

/**
 * Applies a batch of operations atomically: if one fails, none is applied.
 * @param document - The document before the batch.
 * @param operations - The changes to make, in order.
 * @returns The new document, or the first failure with its position in the batch.
 */
export const applyOperations = (
  document: DesignDocument,
  operations: readonly DesignOperation[]
): OperationResult =>
  operations.reduce<OperationResult>(
    (result, operation, position) => {
      if (!result.ok) return result
      const next = applyOperation(result.document, operation)
      return next.ok ? next : failure(`Operation ${position}: ${next.error}`)
    },
    { ok: true, document }
  )

/**
 * Lists every visible drawable node in paint order, depth first, back to front.
 * @param document - The document to read.
 * @param nodeId - Where to start; the root page by default.
 * @returns The nodes to draw, parents before their children.
 */
export const getPaintOrder = (
  document: DesignDocument,
  nodeId: string = document.rootId
): DesignNode[] =>
  getChildren(document, nodeId)
    .filter((node) => node.visible)
    .flatMap((node) => [node, ...getPaintOrder(document, node.id)])
