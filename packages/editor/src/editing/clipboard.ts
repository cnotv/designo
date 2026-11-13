import {
  getSubtreeIds,
  type DesignDocument,
  type DesignNode,
  type DesignOperation
} from '@designo/core'
import { getTopmostIds } from './selection.ts'
import type { ClipboardContent, CreatedNodes, NodeIdFactory } from './types.ts'

export const COPY_OFFSET = 10

const CONTAINER_TYPES: readonly string[] = ['page', 'frame', 'group']

const isCopyable = (document: DesignDocument, nodeId: string): boolean =>
  nodeId !== document.rootId && document.nodes[nodeId] !== undefined

/**
 * Takes the selected subtrees for the clipboard.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @returns The outermost selected nodes with everything in them, or undefined when nothing can
 * be copied.
 */
export const copySubtrees = (
  document: DesignDocument,
  nodeIds: readonly string[]
): ClipboardContent | undefined => {
  const rootIds = getTopmostIds(document, nodeIds).filter((nodeId) => isCopyable(document, nodeId))
  if (rootIds.length === 0) return undefined
  const nodes = rootIds.flatMap((rootId) =>
    getSubtreeIds(document, rootId).map((nodeId) => document.nodes[nodeId])
  )
  return { rootIds, nodes: nodes.filter((node): node is DesignNode => node !== undefined) }
}

const cloneNode = (
  node: DesignNode,
  newId: string,
  parentId: string,
  isRoot: boolean,
  offset: number
): DesignOperation[] => {
  const { id: _id, parentId: _parentId, order, type, ...properties } = node
  if (type === 'page') return []
  return [
    {
      kind: 'create',
      id: newId,
      type,
      parentId,
      // Roots go on top of their new siblings; inside a copy the original stacking is kept.
      ...(isRoot ? {} : { order }),
      properties: { ...properties, x: node.x + offset, y: node.y + offset }
    }
  ]
}

const resolveParent = (document: DesignDocument, wantedParentId: string | null): string => {
  const parent = wantedParentId ? document.nodes[wantedParentId] : undefined
  return parent && CONTAINER_TYPES.includes(parent.type) ? parent.id : document.rootId
}

/**
 * Builds the creates that place copies of clipboard nodes, with new ids. Coordinates are
 * absolute, so each copy and everything in it shifts by the offset.
 * @param document - The document the copies go into.
 * @param content - The nodes to copy.
 * @param offset - How far to shift the copies on both axes.
 * @param createId - Makes a new id for a node type.
 * @returns The creates, and the ids of the copied roots.
 */
export const createCopyOperations = (
  document: DesignDocument,
  content: ClipboardContent,
  offset: number,
  createId: NodeIdFactory
): CreatedNodes => {
  const newIds = new Map(content.nodes.map((node) => [node.id, createId(node.type)]))
  const operations = content.nodes.flatMap((node) => {
    const isRoot = content.rootIds.includes(node.id)
    const parentId = isRoot
      ? resolveParent(document, node.parentId)
      : (newIds.get(node.parentId ?? '') ?? document.rootId)
    return cloneNode(node, newIds.get(node.id) ?? node.id, parentId, isRoot, offset)
  })
  const rootIds = content.rootIds.flatMap((rootId) => newIds.get(rootId) ?? [])
  return { operations, rootIds }
}

/**
 * Builds the duplicate of the selection: copies in the same parents, shifted by ten pixels.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @param createId - Makes a new id for a node type.
 * @returns The creates and the new roots, or nothing when the selection cannot be copied.
 */
export const createDuplicateOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  createId: NodeIdFactory
): CreatedNodes => {
  const content = copySubtrees(document, nodeIds)
  return content
    ? createCopyOperations(document, content, COPY_OFFSET, createId)
    : { operations: [], rootIds: [] }
}

/**
 * Builds a paste. Each paste of the same clipboard sits one step further along, so they cascade.
 * @param document - The document.
 * @param content - The clipboard.
 * @param pasteIndex - How many times this clipboard has been pasted before.
 * @param createId - Makes a new id for a node type.
 * @returns The creates and the new roots.
 */
export const createPasteOperations = (
  document: DesignDocument,
  content: ClipboardContent,
  pasteIndex: number,
  createId: NodeIdFactory
): CreatedNodes => createCopyOperations(document, content, COPY_OFFSET * (pasteIndex + 1), createId)
