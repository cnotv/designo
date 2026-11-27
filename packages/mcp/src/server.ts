import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  FONT_STYLES,
  LIST_STYLES,
  MAX_FONT_WEIGHT,
  MAX_LETTER_SPACING,
  MAX_LIST_INDENT,
  MIN_FONT_WEIGHT,
  MIN_LETTER_SPACING,
  MIN_LIST_INDENT,
  TEXT_ALIGNMENTS
} from '@designo/core'
import { z } from 'zod'
import {
  creatableNodeTypeSchema,
  fileIdSchema,
  nodeIdSchema,
  styledNodePatchSchema,
  operationBatchSchema,
  pageSetupSchema,
  textSpansSchema
} from '@designo/storage'
import { addImageTool } from './addImage.ts'
import {
  applyOperationsTool,
  checkAtsTool,
  combineNodesTool,
  createFileTool,
  exportPdfTool,
  exportSvgTool,
  getDocumentTreeTool,
  getNodeTool,
  getScreenshotTool,
  getStylesTool,
  listFilesTool,
  measureTextTool,
  setPageSetupTool
} from './tools.ts'
import { MAX_SCREENSHOT_SCALE, MIN_SCREENSHOT_SCALE } from './rasterize.ts'
import type { DesignoToolContext, PdfFile, ScreenshotImage } from './types.ts'

const SERVER_VERSION = '0.0.0'
const MAX_TREE_DEPTH = 50
const MAX_COMBINED_NODES = 100
const MAX_MEASURED_TEXT_LENGTH = 100_000
const MAX_FONT_FAMILY_LENGTH = 200
// A 20 MB picture is about 28 million characters of base64.
const MAX_LOCATION_LENGTH = 4096
const MAX_IMAGE_BASE64_LENGTH = 28_000_000
const MAX_PDF_BASE64_LENGTH = 28_000_000

const toToolResult = async (work: () => Promise<unknown>): Promise<CallToolResult> => {
  try {
    const value = await work()
    return { content: [{ type: 'text', text: JSON.stringify(value, undefined, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
}

const toImageResult = async (work: () => Promise<ScreenshotImage>): Promise<CallToolResult> => {
  try {
    const { data, mimeType } = await work()
    return { content: [{ type: 'image', data, mimeType }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
}

const toPdfResult = async (work: () => Promise<PdfFile>): Promise<CallToolResult> => {
  try {
    const { data, mimeType } = await work()
    return {
      content: [
        { type: 'resource', resource: { uri: 'designo://export.pdf', mimeType, blob: data } }
      ]
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
}

const READ_ONLY = { readOnlyHint: true } as const

const registerReadTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'list_files',
    { description: 'List the Designo files with their ids and names.', annotations: READ_ONLY },
    () => toToolResult(() => listFilesTool(context))
  )
  server.registerTool(
    'get_document_tree',
    {
      description:
        'Read the node tree of a file. Starts at the root page unless nodeId is given; depth limits how many levels of children are returned (default 3).',
      inputSchema: {
        fileId: fileIdSchema,
        nodeId: nodeIdSchema.optional(),
        depth: z.number().int().min(0).max(MAX_TREE_DEPTH).optional()
      },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => getDocumentTreeTool(context, input))
  )
  server.registerTool(
    'get_node',
    {
      description: 'Read one node with all its properties.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => getNodeTool(context, input))
  )
  server.registerTool(
    'get_screenshot',
    {
      description:
        'Render the page, or one node, to a PNG image so you can see the design. Fixed-width text wraps where the editor wraps it; other text is drawn without shaping, so it differs slightly. scale is pixels per design unit (default 1).',
      inputSchema: {
        fileId: fileIdSchema,
        nodeId: nodeIdSchema.optional(),
        scale: z.number().min(MIN_SCREENSHOT_SCALE).max(MAX_SCREENSHOT_SCALE).optional()
      },
      annotations: READ_ONLY
    },
    (input) => toImageResult(() => getScreenshotTool(context, input))
  )
  server.registerTool(
    'measure_text',
    {
      description:
        'Measure a text the way the editor lays it out, to size a panel before drawing it. Give the font and size you will use; omitted ones are a new text node defaults. width wraps the text like a fixed-width node; without it the text runs on one line per line break. Returns the width and height of the box, and the text of each line.',
      inputSchema: {
        text: z.string().max(MAX_MEASURED_TEXT_LENGTH),
        fontFamily: z.string().max(MAX_FONT_FAMILY_LENGTH).optional(),
        fontWeight: z.number().min(MIN_FONT_WEIGHT).max(MAX_FONT_WEIGHT).optional(),
        fontStyle: z.enum(FONT_STYLES).optional(),
        letterSpacing: z.number().min(MIN_LETTER_SPACING).max(MAX_LETTER_SPACING).optional(),
        fontSize: z.number().positive().optional(),
        lineHeight: z.number().positive().optional(),
        textAlign: z.enum(TEXT_ALIGNMENTS).optional(),
        width: z.number().positive().optional(),
        spans: textSpansSchema.optional(),
        listStyle: z.enum(LIST_STYLES).optional(),
        listIndent: z.number().min(MIN_LIST_INDENT).max(MAX_LIST_INDENT).optional()
      },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => measureTextTool(context, input))
  )
  server.registerTool(
    'export_svg',
    {
      description:
        'Export the page, or one node, as standalone SVG text. Fixed-width text is broken into lines where the editor wraps it. Coordinates are absolute on the page and the viewBox is the node bounds.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema.optional() },
      annotations: READ_ONLY
    },
    async (input) => {
      try {
        return { content: [{ type: 'text', text: await exportSvgTool(context, input) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { isError: true, content: [{ type: 'text', text: message }] }
      }
    }
  )
  server.registerTool(
    'export_pdf',
    {
      description:
        'Export the file as one PDF. Frames given a pdfPage (a whole number from 1) are its pages, in that order, each as large as the frame and clipped to it; set it on each spread or page of a book laid out on one canvas, and everything outside those frames is left out. With no such frame, it has a page for each page, in order, each as large as its content. One design unit is a point. Shapes, clipping frames, gradients, opacity and blend modes are vector; text is selectable and set in its embedded fonts, broken into lines where the editor breaks it; a node with blur or a shadow is an image. A frame with bleed (set_page_setup) makes a page that is the trim plus the bleed on every side, with a BleedBox and a TrimBox, its fill and clip reaching the bleed edge; trimMarks true adds crop marks in a slug beyond the bleed. colorSpace cmyk writes fills, strokes, gradients and text as DeviceCMYK for a print shop, converted from sRGB by the device formula with no colour profile (rgb, the default, keeps them as designed); images stay as they are. Layout guides are never drawn. The title, author, subject and language (a tag such as en or de-DE) come from an updateMetadata operation of apply_ops (the title falls back to the file name); text nodes with a pdfTag (h1 to h6, p, li) make it a tagged PDF whose reading order is the order of the children of the frame. Returns the PDF as an embedded resource.',
      inputSchema: {
        fileId: fileIdSchema,
        trimMarks: z.boolean().optional(),
        colorSpace: z.enum(['rgb', 'cmyk']).optional()
      },
      annotations: READ_ONLY
    },
    (input) => toPdfResult(() => exportPdfTool(context, input))
  )
}

const registerAtsTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'check_ats',
    {
      description:
        'Report what an applicant tracking system (ATS) could read from a PDF, for a resume or any document sent to a parser. Give exactly one of fileId (the file is exported, then checked against its document) and pdfBase64 (a PDF made elsewhere, base64, checked on its own: selectable-text, text-extraction and text over a picture need the document, so they come back in notChecked with the reason, never as passes, and text-layer fails a page with no text, such as a scan). Each finding is pass, warn or fail with a rule name and, when it concerns one thing, the node id or page: selectable-text (every text is text in the PDF, none an image), text-extraction (a pdf.js reader gets the words back without lost spaces or reordering), fonts (embedded with a Unicode map), reading-order (columns and tables a single-column reader interleaves), contact-details (a name, an email and a phone number in the first lines), section-headings (experience, education and skills as plain text lines), layout-traps (text in the header or footer strip, over a picture, or an icon in place of a word), metadata (title, author, language) and links (each link is an annotation with visible text). The report also lists the text in reading order, page by page. It names the reader and rules that produced it and is not a real ATS.',
      inputSchema: {
        fileId: fileIdSchema.optional(),
        pdfBase64: z.string().max(MAX_PDF_BASE64_LENGTH).optional()
      },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => checkAtsTool(context, input))
  )
}

const registerStyleTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'get_styles',
    {
      description:
        'List the variables and text styles of a file. Variables are named colours and numbers; a node references one through `bindings` (property to variable id) and follows it. Text styles are named bundles of font, size, weight, style, line height and letter spacing; a text references one through `textStyleId`. Create, change and delete them with the setVariable, deleteVariable, setTextStyle and deleteTextStyle operations of apply_ops; changing one updates every node that uses it, in the editor, screenshots, SVG and PDF.',
      inputSchema: { fileId: fileIdSchema },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => getStylesTool(context, input))
  )
}

const registerShapeTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'combine_nodes',
    {
      description:
        'Combine two or more rectangles, ellipses or paths that share a parent into one path node: union (everything they cover), subtract (the first, back-most shape with every later one cut from it), intersect (where they all overlap) or exclude (everything but where they overlap). The shapes are replaced; the path takes the paint of the back-most one and its place in the layers, and keeps its curves. A path node has pathData (SVG path data with M, L, H, V, C, S, Q, T, A and Z, with 0,0 at the top left of the node box), so create_node with type path and pathData draws any outline directly. Returns the new nodeId.',
      inputSchema: {
        fileId: fileIdSchema,
        operation: z.enum(['union', 'subtract', 'intersect', 'exclude']),
        nodeIds: z.array(nodeIdSchema).min(2).max(MAX_COMBINED_NODES)
      },
      annotations: { destructiveHint: true }
    },
    (input) => toToolResult(() => combineNodesTool(context, input))
  )
}

const registerWriteTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'create_file',
    {
      description: 'Create an empty file with one page. Returns its fileId and pageId.',
      inputSchema: { name: z.string().min(1).max(200) }
    },
    (input) => toToolResult(() => createFileTool(context, input))
  )
  server.registerTool(
    'create_node',
    {
      description:
        'Create one node under a page, frame or group. Coordinates are absolute on the page, not relative to the parent frame. Text nodes are sized to their words, as the editor does. Returns the new id, and a warning if the node lies outside its parent frame, where it would not show.',
      inputSchema: {
        fileId: fileIdSchema,
        type: creatableNodeTypeSchema,
        parentId: nodeIdSchema,
        properties: styledNodePatchSchema.optional()
      }
    },
    ({ fileId, ...operation }) =>
      toToolResult(() =>
        applyOperationsTool(context, { fileId, operations: [{ kind: 'create', ...operation }] })
      )
  )
  server.registerTool(
    'add_image',
    {
      description:
        'Store a picture (PNG, JPEG, WebP or GIF, at most 20 MB) and place it as an image node under a page, frame or group. Give the picture as exactly one of: data (base64), path (a file the server can read), url (http or https), or assetId (a picture already stored, no bytes needed). Bytes that do not decode as a picture are refused. It is stretched to the node box by default, so give the width or the height alone to keep its proportions; with neither it takes its own size in pixels. Set the imageFit property to fit (all of it, in proportion, inside the box) or fill (covers the box in proportion, cropped) with update_node. Coordinates are absolute on the page. Returns assetId, which another image node can use as its imageAsset, the new nodeId, and its size. Screenshots, SVG and PDF include the picture.',
      inputSchema: {
        fileId: fileIdSchema,
        parentId: nodeIdSchema,
        data: z.string().min(1).max(MAX_IMAGE_BASE64_LENGTH).optional(),
        path: z.string().min(1).max(MAX_LOCATION_LENGTH).optional(),
        url: z.string().min(1).max(MAX_LOCATION_LENGTH).optional(),
        assetId: z.string().min(1).max(200).optional(),
        name: z.string().max(200).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional()
      }
    },
    (input) => toToolResult(() => addImageTool(context, input))
  )
  server.registerTool(
    'update_node',
    {
      description: 'Change some properties of one node; the rest stay as they are.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema, patch: styledNodePatchSchema }
    },
    ({ fileId, nodeId, patch }) =>
      toToolResult(() =>
        applyOperationsTool(context, {
          fileId,
          operations: [{ kind: 'update', id: nodeId, patch }]
        })
      )
  )
  server.registerTool(
    'delete_node',
    {
      description: 'Delete a node and everything inside it.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema },
      annotations: { destructiveHint: true }
    },
    ({ fileId, nodeId }) =>
      toToolResult(() =>
        applyOperationsTool(context, { fileId, operations: [{ kind: 'delete', id: nodeId }] })
      )
  )
  server.registerTool(
    'set_page_setup',
    {
      description:
        'Set a frame as a printed page: its size, bleed, facing and layout guides, written in millimetres (unit mm) or points (pt); the file stores points. The frame box is the trim and the bleed lies outside it. facing is single, left or right (one of a facing pair, with the inner margin along the spine) or spread (two pages in one frame). margins, columns, gutter and fold are layout guides: kept on the page, drawn under the content in the editor, never exported. Fields left out keep their value; guides: null removes the guides. Give the frame a pdfPage to print it.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema, setup: pageSetupSchema }
    },
    (input) => toToolResult(() => setPageSetupTool(context, input))
  )
  server.registerTool(
    'apply_ops',
    {
      description:
        'Apply a batch of create, createPage, reorderPage, update, setVariable (variable with id, name, kind color or number, and a value), deleteVariable, setTextStyle (style with id, name, fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing), deleteTextStyle, updateMetadata (patch with title, author, subject, language for the PDF; an empty string clears one), delete, move, createInstance, detachInstance and resetOverrides operations as one change: if one fails, nothing is saved. Variables and text styles: bind a property by setting `bindings` on create or update, for example {"fill": "ink"}; set `textStyleId` on a text; a property set directly on a node ends its binding, or stays the text own against its style. Components: update a frame or group with patch isComponent true to make it a component; createInstance (componentId, parentId, x, y) places a copy that follows the component, named `<instance id>:<component node id>` for each node inside it; editing a property of an instance node keeps it as an override; resetOverrides drops them; detachInstance turns the instance into plain nodes. createPage adds a page after the others (or at order), reorderPage gives a page a new order, and nodes can then be created inside it by its id; export_pdf prints each page, or the frames given a pdfPage. Master pages: update a frame with isMaster true to make it a master; update a page frame with masterId set to the id of the master and the children of the master are drawn on it, behind its own nodes, in screenshots, SVG and PDF; a text with {page} shows the number of its page (its pdfPage, else its place among the frames that use a master); masterHidden lists master child ids a page leaves out. Give create operations your own ids to nest nodes inside each other in the same batch. The order of a move puts the node in front of a sibling that holds the same order (that sibling and the ones above it shift up by one), so order 0 inserts at the front. Coordinates are absolute on the page. The result warns about each node left outside its parent frame. Prefer this over single-node tools when building a layout.',
      inputSchema: {
        fileId: fileIdSchema,
        operations: operationBatchSchema
      },
      annotations: { destructiveHint: true }
    },
    (input) => toToolResult(() => applyOperationsTool(context, input))
  )
}

/**
 * Builds the Designo MCP server with every tool registered.
 * @param context - Where files live and how ids are made.
 * @returns The server, ready to connect to a transport.
 */
export const createDesignoServer = (context: DesignoToolContext): McpServer => {
  const server = new McpServer({ name: 'designo', version: SERVER_VERSION })
  registerReadTools(server, context)
  registerStyleTools(server, context)
  registerAtsTools(server, context)
  registerWriteTools(server, context)
  registerShapeTools(server, context)
  return server
}
