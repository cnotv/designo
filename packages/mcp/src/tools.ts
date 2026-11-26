import { exportNodeToSvg, type TextLineRange } from '@designo/exporter'
import { exportDocumentToPdf } from '@designo/exporter/pdf'
import {
  DEFAULT_NODE_PROPERTIES,
  createDocument,
  getNodeTree,
  resolveMasters,
  getSubtreeIds,
  type DesignDocument,
  type DesignNode,
  type DesignNodeTree,
  type PageSetupInput,
  getPageSetupPatch,
  type ListStyle,
  type TextAlign,
  type TextSpan
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
import { loadDocumentImages, loadSubtreeImages, toImageLookups } from './images.ts'
import { rasterizeSvgToPng } from './rasterize.ts'
import { loadScreenshotFonts } from './screenshotFonts.ts'
import type {
  DesignoToolContext,
  PdfFile,
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
 * Sets a frame's page setup: size, bleed, facing and layout guides, written in millimetres or points.
 * @param context - Where files live and how ids are made.
 * @param input - The file, the frame and the setup; lengths are in `setup.unit`.
 * @returns Nothing; the frame holds the setup in points.
 */
export const setPageSetupTool = async (
  context: DesignoToolContext,
  input: { fileId: string; nodeId: string; setup: PageSetupInput }
): Promise<{ nodeId: string }> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  const node = document.nodes[input.nodeId]
  if (!node) throw new Error(`Node ${input.nodeId} does not exist`)
  if (node.type !== 'frame') {
    throw new Error(`Node ${input.nodeId} is a ${node.type}; a page setup belongs to a frame`)
  }
  await applyOperationsToFile(
    context.dataDirectory,
    input.fileId,
    [{ kind: 'update', id: input.nodeId, patch: getPageSetupPatch(node, input.setup) }],
    context.generateId
  )
  return { nodeId: input.nodeId }
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
  const { document, warnings: fitWarnings } = await fitTextBoxesUntilSettled(
    context,
    input.fileId,
    { before, applied, operations }
  )
  return {
    createdNodeIds: applied.createdNodeIds,
    warnings: [
      ...fitWarnings,
      ...findOutsideParentWarnings(document, operations, applied.createdNodeIds)
    ]
  }
}

// Fitting a text can move its siblings (an auto-width text shrinks, its row hands the room to a
// text that fills), which changes the width another text wraps at, so fitting repeats until no
// width moves. The depth bounds a layout that never settles.
const MAX_FIT_ROUNDS = 5

const fitTextBoxesUntilSettled = async (
  context: DesignoToolContext,
  fileId: string,
  start: {
    before: DesignDocument
    applied: { document: DesignDocument; createdNodeIds: string[] }
    operations: readonly OperationInput[]
  },
  round = 0,
  seenWarnings: readonly string[] = []
): Promise<{ document: DesignDocument; warnings: string[] }> => {
  const { before, applied, operations } = start
  const { updates, warnings } = await findTextBoxFits(
    applied.document,
    before,
    operations,
    applied.createdNodeIds,
    context.layoutText ?? layoutTextWithFontsourceFonts
  )
  const allWarnings = [...new Set([...seenWarnings, ...warnings])]
  if (updates.length === 0 || round >= MAX_FIT_ROUNDS) {
    return { document: applied.document, warnings: allWarnings }
  }
  const fitted = await applyOperationsToFile(
    context.dataDirectory,
    fileId,
    updates,
    context.generateId
  )
  return fitTextBoxesUntilSettled(
    context,
    fileId,
    { before: applied.document, applied: { ...fitted, createdNodeIds: [] }, operations: [] },
    round + 1,
    allWarnings
  )
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
  const document = resolveMasters(await readDocument(context.dataDirectory, input.fileId))
  const nodeId = input.nodeId ?? document.rootId
  return exportNodeToSvg(document, nodeId, {
    getTextLines: await findTextLines(context, document, nodeId),
    getImageHref: toImageLookups(await loadSubtreeImages(context.dataDirectory, document, nodeId))
      .getImageHref
  })
}

// A blurred node is an image in the PDF, so it is drawn at the density a print needs.
const PDF_RASTER_SCALE = 3

/**
 * Writes the file as a PDF, a page for each page in it, in order. Text is set in the fonts the
 * editor lays it out with, embedded in the file; guides are never drawn.
 * @param context - Where files live and how text is laid out.
 * @param input - The file.
 * @returns The PDF as base64 with its MIME type.
 */
export const exportPdfTool = async (
  context: DesignoToolContext,
  input: { fileId: string; trimMarks?: boolean }
): Promise<PdfFile> => {
  const document = resolveMasters(await readDocument(context.dataDirectory, input.fileId))
  const layoutText = context.layoutText ?? layoutTextWithFontsourceFonts
  const layouts = new Map(
    await Promise.all(
      Object.values(document.nodes)
        .filter((node) => node.type === 'text' && node.visible && node.text !== '')
        .map(async (node) => [node.id, await layoutText(toTextLayoutRequest(node))] as const)
    )
  )
  const lookups = toImageLookups(await loadDocumentImages(context.dataDirectory, document))
  const bytes = await exportDocumentToPdf(document, {
    ...lookups,
    trimMarks: input.trimMarks,
    getTextLayout: (node) => layouts.get(node.id),
    getFontBytes: context.getFontBytes ?? layoutTextWithFontsourceFonts.getFontBytes,
    rasterizeNode: async (nodeId) => {
      const outcome = await (context.rasterize ?? rasterizeSvgToPng)(
        exportNodeToSvg(document, nodeId, { getImageHref: lookups.getImageHref }),
        PDF_RASTER_SCALE,
        []
      )
      return outcome.ok ? outcome.png : undefined
    }
  })
  return { mimeType: 'application/pdf', data: Buffer.from(bytes).toString('base64') }
}

const collectTexts = (document: DesignDocument, nodeId: string): ScreenshotText[] =>
  getSubtreeIds(document, nodeId).flatMap((id) => {
    const node = document.nodes[id]
    return node?.type === 'text' && node.text !== ''
      ? [
          {
            fontFamily: node.fontFamily,
            fontWeight: node.fontWeight,
            fontStyle: node.fontStyle,
            text: node.text
          }
        ]
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
  const document = resolveMasters(await readDocument(context.dataDirectory, input.fileId))
  const nodeId = input.nodeId ?? document.rootId
  const fonts = await (context.loadScreenshotFonts ?? loadScreenshotFonts)(
    collectTexts(document, nodeId)
  )
  const svg = exportNodeToSvg(document, nodeId, {
    resolveFontFamily: fonts.resolveFontFamily,
    getFontMetrics: fonts.getFontMetrics,
    getTextLines: await findTextLines(context, document, nodeId),
    getImageHref: toImageLookups(await loadSubtreeImages(context.dataDirectory, document, nodeId))
      .getImageHref
  })
  const outcome = await (context.rasterize ?? rasterizeSvgToPng)(svg, input.scale ?? 1, fonts.files)
  if (!outcome.ok) throw new Error(outcome.message)
  return { mimeType: 'image/png', data: outcome.png.toString('base64') }
}

type TextMeasureInput = {
  text: string
  fontFamily?: string
  fontWeight?: number
  fontStyle?: 'normal' | 'italic'
  letterSpacing?: number
  fontSize?: number
  lineHeight?: number
  textAlign?: TextAlign
  width?: number
  spans?: readonly TextSpan[]
  listStyle?: ListStyle
  listIndent?: number
}

const toMeasuredFace = (input: TextMeasureInput) => ({
  fontFamily: input.fontFamily ?? DEFAULT_NODE_PROPERTIES.fontFamily,
  fontWeight: input.fontWeight ?? DEFAULT_NODE_PROPERTIES.fontWeight,
  fontStyle: input.fontStyle ?? DEFAULT_NODE_PROPERTIES.fontStyle,
  letterSpacing: input.letterSpacing ?? DEFAULT_NODE_PROPERTIES.letterSpacing,
  fontSize: input.fontSize ?? DEFAULT_NODE_PROPERTIES.fontSize
})

const toMeasuredBox = (input: TextMeasureInput) => ({
  lineHeight: input.lineHeight ?? DEFAULT_NODE_PROPERTIES.lineHeight,
  alignment: input.textAlign ?? DEFAULT_NODE_PROPERTIES.textAlign,
  wrapWidth: input.width,
  spans: input.spans ?? DEFAULT_NODE_PROPERTIES.spans,
  listStyle: input.listStyle ?? DEFAULT_NODE_PROPERTIES.listStyle,
  listIndent: input.listIndent ?? DEFAULT_NODE_PROPERTIES.listIndent
})

/**
 * Measures a text the way the editor lays it out, so an agent can size a panel before it draws.
 * @param context - Where files live and how text is laid out.
 * @param input - The text and, where it differs from a new text node's, its font and box.
 * @returns The box the text fills, and the text of each line.
 */
export const measureTextTool = async (
  context: DesignoToolContext,
  input: TextMeasureInput
): Promise<TextMeasurement> => {
  const layout = await (context.layoutText ?? layoutTextWithFontsourceFonts)({
    text: input.text,
    ...toMeasuredFace(input),
    ...toMeasuredBox(input)
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
