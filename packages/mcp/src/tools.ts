import { checkAts, checkPdfAts, type AtsReport, type PdfFacts } from '@designo/ats'
import { extractPdfFacts } from '@designo/ats/extract'
import { exportNodeToSvg, type OutlinedGlyph, type TextLineRange } from '@designo/exporter'
import { exportDocumentToPdf } from '@designo/exporter/pdf'
import {
  DEFAULT_NODE_PROPERTIES,
  createDocument,
  getBooleanOperations,
  getNodeTree,
  resolveMasters,
  getSubtreeIds,
  type BooleanOperation,
  type DesignDocument,
  type DesignNode,
  type DesignNodeTree,
  type DesignVariable,
  type TextStyle,
  type PageSetupInput,
  getPageSetupPatch,
  type ListStyle,
  type TextAlign,
  type TextSpan
} from '@designo/core'
import {
  applyOperationsToFile,
  listDocuments,
  operationBatchSchema,
  readDocument,
  writeDocument,
  type DocumentSummary,
  type OperationInput,
  type UploadedFontSummary
} from '@designo/storage'
import { toTextLayoutRequest, type TextLayout } from '@designo/text'
import { findTextBoxFits, inferFixedWidth } from './fitTextBoxes.ts'
import { findOutsideParentWarnings } from './outsideParentWarnings.ts'
import { loadDocumentImages, loadSubtreeImages, toImageLookups } from './images.ts'
import { rasterizeSvgToPng } from './rasterize.ts'
import { getAccountFonts, listUploadedFonts } from './uploadedFonts.ts'
import type {
  DesignoToolContext,
  GetGlyphOutline,
  LayoutText,
  PdfExportInput,
  PdfFile,
  ScreenshotImage,
  ScreenshotText,
  TextMeasurement
} from './types.ts'

// A host or a test that brings its own layout keeps it; otherwise the account's fonts decide.
const getLayoutText = async (context: DesignoToolContext): Promise<LayoutText> =>
  context.layoutText ?? (await getAccountFonts(context.dataDirectory)).layoutText

/**
 * Lists the files an agent can open.
 * @param context - Where files live and how ids are made.
 * @returns A summary of each file.
 */
export const listFilesTool = (context: DesignoToolContext): Promise<DocumentSummary[]> =>
  listDocuments(context.dataDirectory)

/**
 * Lists the fonts the account uploaded, which a text can name in its `fontFamily`.
 * @param context - Where the account's files live.
 * @returns Each font's id, family, weight and style.
 */
export const listFontsTool = (context: DesignoToolContext): Promise<UploadedFontSummary[]> =>
  listUploadedFonts(context.dataDirectory)

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
 * Lists the variables and text styles of a file.
 * @param context - Where files live and how ids are made.
 * @param input - The file.
 * @returns Every variable and every text style.
 */
export const getStylesTool = async (
  context: DesignoToolContext,
  input: { fileId: string }
): Promise<{ variables: DesignVariable[]; textStyles: TextStyle[] }> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  return {
    variables: Object.values(document.variables ?? {}),
    textStyles: Object.values(document.textStyles ?? {})
  }
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
 * Replaces shapes with one path: their union, what is left of the first after the others are cut
 * from it, their overlap, or everything but their overlap.
 * @param context - Where files live and how ids are made.
 * @param input - The file, the operation, and the rectangles, ellipses or paths to combine.
 * @returns The id of the new path.
 */
export const combineNodesTool = async (
  context: DesignoToolContext,
  input: { fileId: string; operation: BooleanOperation; nodeIds: readonly string[] }
): Promise<{ nodeId: string }> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  const nodeId = context.generateId('path')
  const operations = getBooleanOperations(document, input.nodeIds, input.operation, nodeId)
  if (operations.length === 0) {
    throw new Error(
      'combine_nodes needs two or more rectangles, ellipses or paths that share a parent'
    )
  }
  // The operations come from core; the schema is the edge every batch to a file passes.
  await applyOperationsToFile(
    context.dataDirectory,
    input.fileId,
    operationBatchSchema.parse(operations),
    context.generateId
  )
  return { nodeId }
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
    await getLayoutText(context)
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
  const layoutText = await getLayoutText(context)
  const layouts = new Map(
    await Promise.all(
      wrapped.map(async (node) => [node.id, await layoutText(toTextLayoutRequest(node))] as const)
    )
  )
  return (node) => layouts.get(node.id)?.lines
}

const getGlyphOutlineLookup = async (context: DesignoToolContext): Promise<GetGlyphOutline> =>
  context.getGlyphOutline ??
  (await getAccountFonts(context.dataDirectory)).layoutText.getGlyphOutline

// Every glyph of a layout with its outline, or undefined when one outline is missing, so the
// text is drawn as SVG text rather than with a gap.
const toOutlinedGlyphs = (
  layout: TextLayout,
  getGlyphOutline: GetGlyphOutline
): OutlinedGlyph[] | undefined => {
  const glyphs = layout.lines.flatMap((line) => line.glyphs)
  const outlines = glyphs.map((glyph) => getGlyphOutline(glyph.fontId, glyph.glyphId))
  if (outlines.some((outline) => outline === undefined)) return undefined
  return glyphs.map((glyph, index) => ({
    pathData: outlines[index]?.pathData ?? '',
    x: glyph.x,
    y: glyph.y,
    scale: glyph.scale,
    ...(glyph.fill === undefined ? {} : { fill: glyph.fill })
  }))
}

// Shapes every text of the subtree with the editor's engine, so each glyph is drawn from the font
// that has it, however many fonts one line needs.
const findTextGlyphs = async (
  context: DesignoToolContext,
  document: DesignDocument,
  nodeId: string
): Promise<(node: DesignNode) => readonly OutlinedGlyph[] | undefined> => {
  const texts = getSubtreeIds(document, nodeId).flatMap((id) => {
    const node = document.nodes[id]
    return node?.type === 'text' && node.text !== '' ? [node] : []
  })
  const [layoutText, getGlyphOutline] = await Promise.all([
    getLayoutText(context),
    getGlyphOutlineLookup(context)
  ])
  const glyphs = new Map(
    await Promise.all(
      texts.map(async (node) => {
        const layout = await layoutText(toTextLayoutRequest(node))
        return [node.id, layout && toOutlinedGlyphs(layout, getGlyphOutline)] as const
      })
    )
  )
  return (node) => glyphs.get(node.id)
}

/**
 * Draws a node (the page by default) as standalone SVG text.
 * @param context - Where files live and how ids are made.
 * @param input - The file, an optional node, and whether text is drawn as glyph outlines rather
 *   than selectable SVG text.
 * @returns The SVG source.
 */
export const exportSvgTool = async (
  context: DesignoToolContext,
  input: { fileId: string; nodeId?: string; textAsPaths?: boolean }
): Promise<string> => {
  const document = resolveMasters(await readDocument(context.dataDirectory, input.fileId))
  const nodeId = input.nodeId ?? document.rootId
  return exportNodeToSvg(document, nodeId, {
    getTextLines: await findTextLines(context, document, nodeId),
    ...(input.textAsPaths
      ? { getTextGlyphs: await findTextGlyphs(context, document, nodeId) }
      : {}),
    getImageHref: toImageLookups(await loadSubtreeImages(context.dataDirectory, document, nodeId))
      .getImageHref
  })
}

// A blurred node is an image in the PDF, so it is drawn at the density a print needs.
const PDF_RASTER_SCALE = 3

const buildPdf = async (
  context: DesignoToolContext,
  input: PdfExportInput
): Promise<{ document: DesignDocument; bytes: Uint8Array }> => {
  const document = resolveMasters(await readDocument(context.dataDirectory, input.fileId))
  const layoutText = await getLayoutText(context)
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
    colorSpace: input.colorSpace,
    getTextLayout: (node) => layouts.get(node.id),
    getFontBytes:
      context.getFontBytes ??
      (await getAccountFonts(context.dataDirectory)).layoutText.getFontBytes,
    rasterizeNode: async (nodeId) => {
      const outcome = await (context.rasterize ?? rasterizeSvgToPng)(
        exportNodeToSvg(document, nodeId, { getImageHref: lookups.getImageHref }),
        PDF_RASTER_SCALE,
        []
      )
      return outcome.ok ? outcome.png : undefined
    }
  })
  return { document, bytes }
}

/**
 * Writes the file as a PDF, a page for each page in it, in order. Text is set in the fonts the
 * editor lays it out with, embedded in the file; guides are never drawn.
 * @param context - Where files live and how text is laid out.
 * @param input - The file, and whether it gets trim marks and CMYK colour.
 * @returns The PDF as base64 with its MIME type.
 */
export const exportPdfTool = async (
  context: DesignoToolContext,
  input: PdfExportInput
): Promise<PdfFile> => {
  const { bytes } = await buildPdf(context, input)
  return { mimeType: 'application/pdf', data: Buffer.from(bytes).toString('base64') }
}

const PDF_SIGNATURE = '%PDF-'

const readPdfFacts = async (bytes: Uint8Array): Promise<PdfFacts> => {
  try {
    return await extractPdfFacts(bytes)
  } catch {
    throw new Error('The PDF could not be read; it may be damaged or protected by a password.')
  }
}

/**
 * Reports what an applicant tracking system could read, from a file of the design or from a PDF
 * made elsewhere. A file is exported first and checked against its document; a PDF is checked on
 * its own, and the rules that need the document are listed as not checked.
 * @param context - Where files live and how text is laid out.
 * @param input - Exactly one of a file id or a base64 PDF.
 * @returns Each rule's finding as pass, warn or fail, with a count of each.
 */
export const checkAtsTool = async (
  context: DesignoToolContext,
  input: { fileId?: string; pdfBase64?: string }
): Promise<AtsReport> => {
  if ((input.fileId === undefined) === (input.pdfBase64 === undefined))
    throw new Error('Give exactly one of fileId and pdfBase64')
  if (input.pdfBase64 !== undefined) {
    const bytes = Buffer.from(input.pdfBase64, 'base64')
    if (!bytes.subarray(0, PDF_SIGNATURE.length).toString('latin1').startsWith(PDF_SIGNATURE))
      throw new Error('pdfBase64 is not a PDF: it does not start with %PDF-')
    return checkPdfAts(await readPdfFacts(bytes))
  }
  const { document, bytes } = await buildPdf(context, { fileId: input.fileId ?? '' })
  return checkAts(document, await readPdfFacts(bytes))
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
  const fonts = await (
    context.loadScreenshotFonts ??
    (await getAccountFonts(context.dataDirectory)).loadScreenshotFonts
  )(collectTexts(document, nodeId))
  const svg = exportNodeToSvg(document, nodeId, {
    resolveFontFamily: fonts.resolveFontFamily,
    getFontMetrics: fonts.getFontMetrics,
    getTextLines: await findTextLines(context, document, nodeId),
    getTextGlyphs: await findTextGlyphs(context, document, nodeId),
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
  const layout = await (
    await getLayoutText(context)
  )({
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
