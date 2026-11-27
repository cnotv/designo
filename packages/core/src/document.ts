import {
  CONTAINER_NODE_TYPES,
  CURRENT_FORMAT_VERSION,
  DEFAULT_NODE_PROPERTIES
} from './defaults.ts'
import {
  checkCreateInstance,
  checkMakeComponent,
  checkNotInsideInstance,
  checkNotInstancePart,
  createInstanceNode,
  getSubtreeNodes,
  isInstanceRoot,
  syncInstances,
  withOverridesAfterPatch
} from './components.ts'
import { applyCommentOperation, isCommentOperation } from './comments.ts'
import { layoutDocument } from './layout.ts'
import { withPathScaledToSize } from './pathOutline.ts'
import {
  applyStyleOperation,
  isStyleOperation,
  resolveStyles,
  withStyleLinksAfterPatch
} from './styles.ts'
import { checkTextSpans, clampSpansToText } from './textSpans.ts'
import type {
  CommentOperation,
  DesignDocument,
  DesignNode,
  DesignNodeTree,
  DesignOperation,
  OperationResult,
  StyleOperation
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
  formatVersion: CURRENT_FORMAT_VERSION,
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
  getChildrenByParent(document).get(parentId) ?? []

// Documents are never mutated, so one grouping per document stays valid. Without it every
// traversal scans all nodes once per node, and a flat page of 5,000 layers took seconds.
const childrenByDocument = new WeakMap<DesignDocument, ReadonlyMap<string | null, DesignNode[]>>()

const groupChildrenByParent = (
  document: DesignDocument
): ReadonlyMap<string | null, DesignNode[]> =>
  new Map(
    [...Map.groupBy(Object.values(document.nodes), (node) => node.parentId)].map(
      ([parentId, children]) => [
        parentId,
        children.toSorted((first, second) => first.order - second.order)
      ]
    )
  )

const getChildrenByParent = (
  document: DesignDocument
): ReadonlyMap<string | null, DesignNode[]> => {
  const cached = childrenByDocument.get(document)
  if (cached) return cached
  const grouped = groupChildrenByParent(document)
  childrenByDocument.set(document, grouped)
  return grouped
}

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

const checkLayout = (node: DesignNode): string | undefined => {
  if (node.layoutMode !== 'none' && node.type !== 'frame')
    return `Node ${node.id} is a ${node.type}; only a frame can have auto-layout`
  if (node.layoutGap < 0 || node.layoutPadding < 0)
    return `Node ${node.id} needs a gap and padding of 0 or more`
  return undefined
}

const withValidNode = (document: DesignDocument, node: DesignNode): OperationResult => {
  const problem = checkLayout(node) ?? checkTextSpans(node)
  return problem ? failure(problem) : withNodes(document, { ...document.nodes, [node.id]: node })
}

const applyCreate = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'create' }>
): OperationResult => {
  if (document.nodes[operation.id]) return failure(`Node ${operation.id} already exists`)
  const parentProblem =
    checkParent(document, operation.parentId) ??
    // A copied instance brings its own links, so duplicate and paste can rebuild one.
    (operation.properties?.sourceId
      ? undefined
      : checkNotInsideInstance(document, operation.parentId))
  if (parentProblem) return failure(parentProblem)
  const node: DesignNode = {
    ...DEFAULT_NODE_PROPERTIES,
    name: `${operation.type.charAt(0).toUpperCase()}${operation.type.slice(1)}`,
    ...operation.properties,
    id: operation.id,
    type: operation.type,
    parentId: operation.parentId,
    order: operation.order ?? nextSiblingOrder(document, operation.parentId)
  }
  return withValidNode(
    document,
    withStyleLinksAfterPatch(node, undefined, operation.properties ?? {})
  )
}

/**
 * The pages of a document in the order they print.
 * @param document - The document to read.
 * @returns The page nodes, by their order.
 */
export const getPageNodes = (document: DesignDocument): DesignNode[] =>
  Object.values(document.nodes)
    .filter((node) => node.type === 'page')
    .toSorted((first, second) => first.order - second.order)

const applyCreatePage = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'createPage' }>
): OperationResult => {
  if (document.nodes[operation.id]) return failure(`Node ${operation.id} already exists`)
  const pages = getPageNodes(document)
  const node: DesignNode = {
    ...DEFAULT_NODE_PROPERTIES,
    fill: null,
    width: 0,
    height: 0,
    name: `Page ${pages.length + 1}`,
    ...operation.properties,
    id: operation.id,
    type: 'page',
    parentId: null,
    order: operation.order ?? (pages.at(-1)?.order ?? -1) + 1
  }
  return withNodes(document, { ...document.nodes, [operation.id]: node })
}

const applyUpdate = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'update' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (!node) return failure(`Node ${operation.id} does not exist`)
  const patch = withPathScaledToSize(node, operation.patch)
  const updated = { ...node, ...clampSpansToText(patch, node) }
  const componentProblem =
    operation.patch.isComponent && !node.isComponent
      ? checkMakeComponent(document, updated)
      : undefined
  if (componentProblem) return failure(componentProblem)
  const withOverrides = withOverridesAfterPatch(document, updated, operation.patch)
  return withValidNode(document, withStyleLinksAfterPatch(withOverrides, node, operation.patch))
}

const applyDelete = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'delete' }>
): OperationResult => {
  const target = document.nodes[operation.id]
  if (!target) return failure(`Node ${operation.id} does not exist`)
  const instanceProblem = checkNotInstancePart(document, target)
  if (instanceProblem) return failure(instanceProblem)
  const remainingPages = getPageNodes(document).filter((page) => page.id !== operation.id)
  if (operation.id === document.rootId && remainingPages.length === 0) {
    return failure('The only page cannot be deleted')
  }
  const removedIds = new Set(getSubtreeIds(document, operation.id))
  const remainingNodes = Object.fromEntries(
    Object.entries(document.nodes).filter(([nodeId]) => !removedIds.has(nodeId))
  )
  const result = withNodes(document, remainingNodes)
  // The root stays a page that exists: the first one left.
  return result.ok && operation.id === document.rootId
    ? {
        ok: true,
        document: { ...result.document, rootId: remainingPages[0]?.id ?? document.rootId }
      }
    : result
}

const applyMove = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'move' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (!node) return failure(`Node ${operation.id} does not exist`)
  const parentProblem =
    checkParent(document, operation.parentId) ??
    checkNotInsideInstance(document, operation.parentId) ??
    checkNotInstancePart(document, node)
  if (parentProblem) return failure(parentProblem)
  if (getSubtreeIds(document, operation.id).includes(operation.parentId)) {
    return failure(`Node ${operation.id} cannot move inside itself`)
  }
  const movedNode: DesignNode = { ...node, parentId: operation.parentId }
  if (operation.order === undefined) {
    return withNodes(document, {
      ...document.nodes,
      [operation.id]: { ...movedNode, order: nextSiblingOrder(document, operation.parentId) }
    })
  }
  return withNodes(document, insertAtOrder(document, movedNode, operation.order))
}

// A move to an order a sibling already holds would tie with it and land behind it, so the node
// goes in front: that sibling and every one above it shift up by one. With no tie nothing else
// changes, which keeps undo exact and leaves the editor's fractional orders alone.
const insertAtOrder = (
  document: DesignDocument,
  movedNode: DesignNode,
  order: number
): Record<string, DesignNode> => {
  const siblings = getChildren(document, movedNode.parentId ?? '').filter(
    (sibling) => sibling.id !== movedNode.id
  )
  const shifted = siblings.some((sibling) => sibling.order === order)
    ? siblings
        .filter((sibling) => sibling.order >= order)
        .map((sibling) => [sibling.id, { ...sibling, order: sibling.order + 1 }] as const)
    : []
  return {
    ...document.nodes,
    ...Object.fromEntries(shifted),
    [movedNode.id]: { ...movedNode, order }
  }
}

const applyReorderPage = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'reorderPage' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (node?.type !== 'page') return failure(`Node ${operation.id} is not a page`)
  return withNodes(document, {
    ...document.nodes,
    [operation.id]: { ...node, order: operation.order }
  })
}

const applyUpdateMetadata = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'updateMetadata' }>
): OperationResult => {
  const merged = { ...document.metadata, ...operation.patch }
  const kept = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== ''))
  const { metadata: _previous, ...withoutMetadata } = document
  // An emptied metadata leaves no key behind, so undo gives back the document it came from.
  return {
    ok: true,
    document:
      Object.keys(kept).length > 0 ? { ...withoutMetadata, metadata: kept } : withoutMetadata
  }
}

const applyCreateInstance = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'createInstance' }>
): OperationResult => {
  if (document.nodes[operation.id]) return failure(`Node ${operation.id} already exists`)
  const problem =
    checkParent(document, operation.parentId) ??
    checkCreateInstance(document, operation.componentId, operation.parentId)
  if (problem) return failure(problem)
  const component = document.nodes[operation.componentId] as DesignNode
  const instance = createInstanceNode(component, {
    id: operation.id,
    parentId: operation.parentId,
    order: operation.order ?? nextSiblingOrder(document, operation.parentId),
    x: operation.x ?? 0,
    y: operation.y ?? 0
  })
  return withNodes(document, { ...document.nodes, [instance.id]: instance })
}

const withoutLinks = (node: DesignNode): DesignNode => {
  const { sourceId: _sourceId, overrides: _overrides, ...plain } = node
  return plain
}

const applyDetachInstance = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'detachInstance' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (!node) return failure(`Node ${operation.id} does not exist`)
  if (!isInstanceRoot(document, node)) return failure(`Node ${operation.id} is not an instance`)
  const detached = getSubtreeNodes(document, node.id).map(withoutLinks)
  return withNodes(document, {
    ...document.nodes,
    ...Object.fromEntries(detached.map((plain) => [plain.id, plain]))
  })
}

const applyResetOverrides = (
  document: DesignDocument,
  operation: Extract<DesignOperation, { kind: 'resetOverrides' }>
): OperationResult => {
  const node = document.nodes[operation.id]
  if (!node) return failure(`Node ${operation.id} does not exist`)
  if (node.sourceId === undefined) return failure(`Node ${operation.id} is not part of an instance`)
  const reset = getSubtreeNodes(document, node.id).map((member) => ({ ...member, overrides: [] }))
  return withNodes(document, {
    ...document.nodes,
    ...Object.fromEntries(reset.map((member) => [member.id, member]))
  })
}

const applyWithoutLayout = (
  document: DesignDocument,
  operation: Exclude<DesignOperation, StyleOperation | CommentOperation>
): OperationResult => {
  if (operation.kind === 'create') return applyCreate(document, operation)
  if (operation.kind === 'createPage') return applyCreatePage(document, operation)
  if (operation.kind === 'update') return applyUpdate(document, operation)
  if (operation.kind === 'delete') return applyDelete(document, operation)
  if (operation.kind === 'reorderPage') return applyReorderPage(document, operation)
  if (operation.kind === 'updateMetadata') return applyUpdateMetadata(document, operation)
  if (operation.kind === 'createInstance') return applyCreateInstance(document, operation)
  if (operation.kind === 'detachInstance') return applyDetachInstance(document, operation)
  if (operation.kind === 'resetOverrides') return applyResetOverrides(document, operation)
  return applyMove(document, operation)
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
  if (isCommentOperation(operation)) return applyCommentOperation(document, operation)
  const applied = isStyleOperation(operation)
    ? applyStyleOperation(document, operation)
    : applyWithoutLayout(document, operation)
  // Variables and styles resolve first, so instances copy the resolved values.
  const result = applied.ok ? resolveStyles(applied.document) : applied
  // Layout is part of every operation, so undo, validation and sync need no second path.
  return result.ok ? { ok: true, document: layoutDocument(syncInstances(result.document)) } : result
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
