import { exportNodeToSvg, type TextLineRange } from '@designo/exporter'
import {
  DEFAULT_NODE_PROPERTIES,
  createDocument,
  getNodeTree,
  getSubtreeIds,
  type DesignDocument,
  type DesignNode,
  type DesignNodeTree
} from '@designo/core'
import {
  applyOperationsToFile,
  listDocuments,
  readDocument,
  writeDocument,
  type DocumentSummary,
  type OperationInput
} from '@designo/storage'
import { toTextLayoutRequest } from '@designo/text'
import { layoutTextWithFontsourceFonts } from './textLayout.ts'
import { findTextBoxFits, inferFixedWidth } from './fitTextBoxes.ts'
import { findOutsideParentWarnings } from './outsideParentWarnings.ts'
import { rasterizeSvgToPng } from './rasterize.ts'
import { loadScreenshotFonts } from './screenshotFonts.ts'
import type {
  DesignoToolContext,
  ScreenshotImage,
  ScreenshotText,
  TextMeasurement
} from './types.ts'

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
 * @returns Ids of the nodes the batch created, and a warning for each node left outside its frame.
 *   Texts the batch touched are sized to their words first, as the editor sizes them.
 */
export const applyOperationsTool = async (
  context: DesignoToolContext,
  input: { fileId: string; operations: readonly OperationInput[] }
): Promise<{ createdNodeIds: string[]; warnings: string[] }> => {
  const before = await readDocument(context.dataDirectory, input.fileId)
  const operations = inferFixedWidth(input.operations, before)
  const applied = await applyOperationsToFile(
    context.dataDirectory,
    input.fileId,
    operations,
    context.generateId
  )
  const fits = await findTextBoxFits(
    applied.document,
    operations,
    applied.createdNodeIds,
    context.layoutText ?? layoutTextWithFontsourceFonts
  )
  const { document } =
    fits.length === 0
      ? applied
      : await applyOperationsToFile(context.dataDirectory, input.fileId, fits, context.generateId)
  return {
    createdNodeIds: applied.createdNodeIds,
    warnings: findOutsideParentWarnings(document, operations, applied.createdNodeIds)
  }
}

// Only a fixed-width text wraps, so only those need the layout engine.
const findTextLines = async (
  context: DesignoToolContext,
  document: DesignDocument,
  nodeId: string
): Promise<(node: DesignNode) => readonly TextLineRange[] | undefined> => {
  const wrapped = getSubtreeIds(document, nodeId).flatMap((id) => {
    const node = document.nodes[id]
    return node?.type === 'text' && node.textWrap && node.text !== '' ? [node] : []
  })
  const layoutText = context.layoutText ?? layoutTextWithFontsourceFonts
  const layouts = new Map(
    await Promise.all(
      wrapped.map(async (node) => [node.id, await layoutText(toTextLayoutRequest(node))] as const)
    )
  )
  return (node) => layouts.get(node.id)?.lines
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
  const nodeId = input.nodeId ?? document.rootId
  return exportNodeToSvg(document, nodeId, {
    getTextLines: await findTextLines(context, document, nodeId)
  })
}

const collectTexts = (document: DesignDocument, nodeId: string): ScreenshotText[] =>
  getSubtreeIds(document, nodeId).flatMap((id) => {
    const node = document.nodes[id]
    return node?.type === 'text' && node.text !== ''
      ? [{ fontFamily: node.fontFamily, text: node.text }]
      : []
  })

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
  const document = await readDocument(context.dataDirectory, input.fileId)
  const nodeId = input.nodeId ?? document.rootId
  const fonts = await (context.loadScreenshotFonts ?? loadScreenshotFonts)(
    collectTexts(document, nodeId)
  )
  const svg = exportNodeToSvg(document, nodeId, {
    resolveFontFamily: fonts.resolveFontFamily,
    getFontMetrics: fonts.getFontMetrics,
    getTextLines: await findTextLines(context, document, nodeId)
  })
  const outcome = await (context.rasterize ?? rasterizeSvgToPng)(svg, input.scale ?? 1, fonts.files)
  if (!outcome.ok) throw new Error(outcome.message)
  return { mimeType: 'image/png', data: outcome.png.toString('base64') }
}

/**
 * Measures a text the way the editor lays it out, so an agent can size a panel before it draws.
 * @param context - Where files live and how text is laid out.
 * @param input - The text and, where it differs from a new text node's, its font and box.
 * @returns The box the text fills, and the text of each line.
 */
export const measureTextTool = async (
  context: DesignoToolContext,
  input: {
    text: string
    fontFamily?: string
    fontSize?: number
    lineHeight?: number
    textAlign?: 'left' | 'center' | 'right'
    width?: number
  }
): Promise<TextMeasurement> => {
  const layout = await (context.layoutText ?? layoutTextWithFontsourceFonts)({
    text: input.text,
    fontFamily: input.fontFamily ?? DEFAULT_NODE_PROPERTIES.fontFamily,
    fontSize: input.fontSize ?? DEFAULT_NODE_PROPERTIES.fontSize,
    lineHeight: input.lineHeight ?? DEFAULT_NODE_PROPERTIES.lineHeight,
    alignment: input.textAlign ?? DEFAULT_NODE_PROPERTIES.textAlign,
    wrapWidth: input.width
  })
  if (!layout) {
    throw new Error(
      'The text could not be measured: the fonts for its family, or for a character in it, are not available.'
    )
  }
  return {
    width: layout.width,
    height: layout.height,
    lineCount: layout.lines.length,
    lines: layout.lines.map((line) => input.text.slice(line.start, line.end))
  }
}
