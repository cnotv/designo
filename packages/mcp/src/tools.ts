import { exportNodeToSvg } from '@designo/exporter'
import { createDocument, getNodeTree, type DesignNode, type DesignNodeTree } from '@designo/core'
import {
  applyOperationsToFile,
  listDocuments,
  readDocument,
  writeDocument,
  type DocumentSummary,
  type OperationInput
} from '@designo/storage'
import { rasterizeSvgToPng } from './rasterize.ts'
import type { DesignoToolContext, ScreenshotImage } from './types.ts'

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

/**
 * Draws a node (the page by default) as standalone SVG text.
 * @param context - Where files live and how ids are made.
 * @param input - The file and an optional node.
 * @returns The SVG source.
 */
export const exportSvgTool = async (
  context: DesignoToolContext,
  input: { fileId: string; nodeId?: string }
): Promise<string> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  return exportNodeToSvg(document, input.nodeId ?? document.rootId)
}

/**
 * Renders a node (the page by default) to a PNG so an agent can see what it made.
 * @param context - Where files live and how ids are made.
 * @param input - The file, an optional node and an optional scale factor.
 * @returns The PNG as base64 with its MIME type.
 */
export const getScreenshotTool = async (
  context: DesignoToolContext,
  input: { fileId: string; nodeId?: string; scale?: number }
): Promise<ScreenshotImage> => {
  const svg = await exportSvgTool(context, input)
  return {
    mimeType: 'image/png',
    data: rasterizeSvgToPng(svg, input.scale ?? 1).toString('base64')
  }
}
