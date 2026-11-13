import { createDocument, getNodeTree, type DesignNode, type DesignNodeTree } from '@designo/core'
import {
  applyOperationsToFile,
  listDocuments,
  readDocument,
  writeDocument,
  type DocumentSummary,
  type OperationInput
} from '@designo/storage'
import type { DesignoToolContext } from './types.ts'

/**
 * Lists the files an agent can open.
 * @param context - Where files live and how ids are made.
 * @returns A summary of each file.
 */
export const listFilesTool = (context: DesignoToolContext): Promise<DocumentSummary[]> =>
  listDocuments(context.dataDirectory)

/**
 * Creates an empty file with one page.
 * @param context - Where files live and how ids are made.
 * @param input - The new file's name.
 * @returns The new file's id and its page's id.
 */
export const createFileTool = async (
  context: DesignoToolContext,
  input: { name: string }
): Promise<{ fileId: string; pageId: string }> => {
  const fileId = context.generateId('file')
  const pageId = context.generateId('page')
  await writeDocument(context.dataDirectory, createDocument(fileId, input.name, pageId))
  return { fileId, pageId }
}

/**
 * Reads the node tree of a file, or of one node in it.
 * @param context - Where files live and how ids are made.
 * @param input - The file, an optional starting node and how deep to go.
 * @returns The tree.
 */
export const getDocumentTreeTool = async (
  context: DesignoToolContext,
  input: { fileId: string; nodeId?: string; depth?: number }
): Promise<DesignNodeTree> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  const tree = getNodeTree(document, input.nodeId ?? document.rootId, input.depth ?? 3)
  if (!tree) throw new Error(`Node ${input.nodeId} does not exist`)
  return tree
}

/**
 * Reads one node with all its properties.
 * @param context - Where files live and how ids are made.
 * @param input - The file and the node.
 * @returns The node.
 */
export const getNodeTool = async (
  context: DesignoToolContext,
  input: { fileId: string; nodeId: string }
): Promise<DesignNode> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  const node = document.nodes[input.nodeId]
  if (!node) throw new Error(`Node ${input.nodeId} does not exist`)
  return node
}

/**
 * Applies a batch of operations to a file as one change; nothing is saved if any fails.
 * @param context - Where files live and how ids are made.
 * @param input - The file and the operations, in order.
 * @returns Ids of the nodes the batch created.
 */
export const applyOperationsTool = async (
  context: DesignoToolContext,
  input: { fileId: string; operations: readonly OperationInput[] }
): Promise<{ createdNodeIds: string[] }> => {
  const { createdNodeIds } = await applyOperationsToFile(
    context.dataDirectory,
    input.fileId,
    input.operations,
    context.generateId
  )
  return { createdNodeIds }
}
