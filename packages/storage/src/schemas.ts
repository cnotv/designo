import {
  BLEND_MODES,
  PDF_TAGS,
  CURRENT_FORMAT_VERSION,
  DEFAULT_NODE_PROPERTIES,
  HEX_COLOR_PATTERN,
  isValidLink,
  FONT_STYLES,
  IMAGE_FITS,
  LAYOUT_ALIGNMENTS,
  LAYOUT_CROSS_ALIGNMENTS,
  LAYOUT_MODES,
  LAYOUT_SIZINGS,
  LIST_STYLES,
  MAX_LIST_INDENT,
  MAX_FONT_WEIGHT,
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MIN_FONT_WEIGHT,
  MIN_LETTER_SPACING,
  MIN_LIST_INDENT,
  MIN_LINE_HEIGHT,
  PAGE_FACINGS,
  PAGE_UNITS,
  TEXT_ALIGNMENTS
} from '@designo/core'
import { z } from 'zod'

const MAX_TEXT_LENGTH = 10_000
const MAX_GUIDE_COLUMNS = 24

export const fileIdSchema = z
  .string()
  .regex(/^[\w-]{1,64}$/, 'Letters, digits, - and _ only, at most 64 characters')

export const nodeIdSchema = z.string().regex(/^[\w:-]{1,64}$/, 'Letters, digits, :, - and _ only')

const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN, 'A hex colour: #rrggbb or #rrggbbaa')

const colorSchema = hexColorSchema.nullable()

const MAX_TEXT_SPANS = 500

const textSpanSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    fontWeight: z.number().min(MIN_FONT_WEIGHT).max(MAX_FONT_WEIGHT).optional(),
    fontStyle: z.enum(FONT_STYLES).optional(),
    fill: hexColorSchema.optional()
  })
  .strict()

export const textSpansSchema = z
  .array(textSpanSchema)
  .max(MAX_TEXT_SPANS)
  .describe(
    'Text only: stretches of text, as UTF-16 offsets start (inclusive) to end (exclusive), drawn in their own fontWeight, fontStyle or fill; what a span leaves out follows the node. In order, never overlapping, inside the text. Replace the whole list to change it; editing text alone cuts spans to the new length. Default none.'
  )

const MAX_GRADIENT_STOPS = 16

const gradientSchema = z
  .object({
    kind: z.enum(['linear', 'radial']),
    angle: z
      .number()
      .describe('Linear only: degrees clockwise from pointing right, so 90 runs top to bottom.'),
    stops: z
      .array(z.object({ offset: z.number().min(0).max(1), color: hexColorSchema }).strict())
      .min(2)
      .max(MAX_GRADIENT_STOPS)
  })
  .strict()
  .describe('Paints the fill instead of `fill`. Stops must be in increasing offset order.')
  .refine(
    ({ stops }) =>
      stops.every((stop, index) => index === 0 || stop.offset >= (stops[index - 1]?.offset ?? 0)),
    {
      message: 'Gradient stops must be in increasing offset order'
    }
  )
  .nullable()

const shadowSchema = z
  .object({ x: z.number(), y: z.number(), blur: z.number().min(0), color: hexColorSchema })
  .strict()
  .describe('A drop shadow: offset x and y, blur as a standard deviation, and a colour.')
  .nullable()

const guidesSchema = z
  .object({
    margins: z
      .object({
        top: z.number().min(0),
        bottom: z.number().min(0),
        inner: z
          .number()
          .min(0)
          .describe('The margin along the spine; the left one of a single page.'),
        outer: z.number().min(0)
      })
      .strict(),
    columns: z.number().int().min(1).max(MAX_GUIDE_COLUMNS),
    gutter: z.number().min(0).describe('The space between columns, in points.'),
    fold: z.boolean().describe('Draws a fold line down the middle of the frame.')
  })
  .strict()
  .describe(
    'Layout guides kept on a frame and drawn under its content in the editor; never exported. All lengths are in points.'
  )
  .nullable()

/** A stored picture's id: the SHA-256 of its bytes, then its type. */
export const assetIdSchema = z
  .string()
  .regex(/^[\da-f]{64}\.(?:png|jpg|webp|gif)$/, 'An asset id, as add_image returns it')

/** An uploaded font's id: the SHA-256 of its bytes, then `ttf` for TrueType or `otf` for CFF outlines. */
export const fontIdSchema = z
  .string()
  .regex(/^[\da-f]{64}\.(?:ttf|otf)$/, 'A font id, as list_fonts returns it')

/** An uploaded font as the server lists it: the family, weight and style its file declares. */
export const uploadedFontSummarySchema = z
  .object({
    id: fontIdSchema,
    family: z.string().min(1),
    fontWeight: z.number().int().min(1).max(1000),
    fontStyle: z.enum(FONT_STYLES)
  })
  .strict()

export const uploadedFontListSchema = z.array(uploadedFontSummarySchema)

const pdfTagSchema = z
  .enum(PDF_TAGS)
  .nullable()
  .describe(
    "Text only: h1 to h6, p or li writes the text as that element of a tagged PDF, so screen readers and parsers read the structure; reading order is the order of the frame's children. null (the default) leaves it untagged."
  )

const MAX_PATH_DATA_LENGTH = 200_000

// Only the characters SVG path data is written in, so the string is safe to put in an attribute.
const pathDataSchema = z
  .string()
  .max(MAX_PATH_DATA_LENGTH)
  .regex(/^[\d\s+,.ACEHLMQSTVZacehlmqstvz-]*$/)
  .describe(
    'Paths only: the outline as SVG path data (M, L, H, V, C, S, Q, T, A, Z), with 0,0 at the top left of the node box. Create a path from outlines with the boolean tool, or draw one point by point.'
  )

export const nodePatchSchema = z
  .object({
    name: z.string().max(200),
    x: z.number(),
    y: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    visible: z.boolean(),
    fill: colorSchema,
    gradient: gradientSchema,
    blur: z.number().min(0).describe('A layer blur as a standard deviation in pixels. 0 is sharp.'),
    blendMode: z.enum(BLEND_MODES).describe('How the node combines with what is behind it.'),
    shadow: shadowSchema,
    stroke: colorSchema,
    strokeWidth: z.number().min(0),
    cornerRadius: z.number().min(0),
    pathData: pathDataSchema,
    imageAsset: assetIdSchema
      .nullable()
      .describe(
        'Images only: the id add_image returned for a stored picture. How it meets the width and height is imageFit. null shows the fill as a placeholder.'
      ),
    imageFit: z
      .enum(IMAGE_FITS)
      .describe(
        'Images only: stretch (default) distorts the picture to the box, fit shows all of it inside the box in proportion, fill covers the box in proportion and crops the overflow.'
      ),
    text: z.string().max(MAX_TEXT_LENGTH),
    fontSize: z.number().positive(),
    fontFamily: z.string().max(200),
    fontWeight: z
      .number()
      .min(MIN_FONT_WEIGHT)
      .max(MAX_FONT_WEIGHT)
      .describe('Text only: a CSS weight from 100 to 900; 400 is regular, 700 bold. Default 400.'),
    fontStyle: z.enum(FONT_STYLES).describe('Text only: normal or italic. Default normal.'),
    letterSpacing: z
      .number()
      .min(MIN_LETTER_SPACING)
      .max(MAX_LETTER_SPACING)
      .describe(
        'Text only: extra space after each character as a multiple of fontSize. Default 0.'
      ),
    textAlign: z
      .enum(TEXT_ALIGNMENTS)
      .describe(
        'Text only: which edge lines sit against inside the width, or justify to fill it (needs textWrap). Default left.'
      ),
    lineHeight: z
      .number()
      .min(MIN_LINE_HEIGHT)
      .max(MAX_LINE_HEIGHT)
      .describe('Text only: distance between lines as a multiple of fontSize. Default 1.2.'),
    textWrap: z
      .boolean()
      .describe(
        'Text only: true makes the node a fixed-width box whose lines wrap at its width; false (the default) sizes the box to its text.'
      ),
    spans: textSpansSchema,
    listStyle: z
      .enum(LIST_STYLES)
      .describe(
        'Text only: bullet or number puts a marker before every paragraph (each line break starts one) and indents its lines past it as a hanging indent, in one text node. Default none.'
      ),
    listIndent: z
      .number()
      .min(MIN_LIST_INDENT)
      .max(MAX_LIST_INDENT)
      .describe(
        'Text only: how far a list is indented past its marker, as a multiple of fontSize. Default 1.5.'
      ),
    pdfPage: z
      .number()
      .int()
      .min(1)
      .nullable()
      .describe(
        'Frames only: a whole number from 1 makes the frame a page of the exported PDF, at its own size, in that order; null (the default) leaves it out. Once any frame has a number, only numbered frames are printed.'
      ),
    link: z
      .string()
      .refine(isValidLink, 'An https:, mailto: or tel: address')
      .nullable()
      .describe(
        'Text, rectangles and frames: an https:, mailto: or tel: address the node opens when clicked in the exported PDF (each line of wrapped text is clickable); null (the default) is no link.'
      ),
    layoutMode: z
      .enum(LAYOUT_MODES)
      .describe(
        'Frames only: horizontal lays the children out in a row, vertical in a column, overwriting their x and y (and the size of any that fill). none (the default) leaves them where they are.'
      ),
    layoutGap: z.number().min(0).describe('Auto-layout frames: the space between children.'),
    layoutPadding: z
      .number()
      .min(0)
      .describe(
        'Auto-layout frames: the space between the frame edge and its children, all sides.'
      ),
    layoutAlign: z
      .enum(LAYOUT_ALIGNMENTS)
      .describe(
        'Auto-layout frames: where children sit along the layout direction. Default start.'
      ),
    layoutCrossAlign: z
      .enum(LAYOUT_CROSS_ALIGNMENTS)
      .describe(
        'Auto-layout frames: where children sit across the layout direction. Default start.'
      ),
    widthSizing: z
      .enum(LAYOUT_SIZINGS)
      .describe(
        'fixed (the default) keeps width. hug sizes an auto-layout frame to its children. fill makes a child of an auto-layout frame share its free space (or stretch, across the direction).'
      ),
    heightSizing: z.enum(LAYOUT_SIZINGS).describe('Like widthSizing, for height.'),
    pageUnit: z
      .enum(PAGE_UNITS)
      .describe('Frames only: the unit a page is shown in. Stored lengths are always points.'),
    bleed: z
      .number()
      .min(0)
      .describe(
        'Frames only: how far the print extends past the frame, which is the trim, in points.'
      ),
    facing: z
      .enum(PAGE_FACINGS)
      .describe(
        'Frames only: single, left or right (one of a facing pair; the inner margin lies along the spine), or spread (two facing pages in one frame).'
      ),
    guides: guidesSchema,
    pdfTag: pdfTagSchema
  })
  .partial()
  .strict()

export const pageSetupSchema = z
  .object({
    unit: z
      .enum(PAGE_UNITS)
      .describe('The unit every length below is in; remembered on the frame.'),
    width: z.number().positive(),
    height: z.number().positive(),
    bleed: z.number().min(0),
    facing: z.enum(PAGE_FACINGS),
    margins: z
      .object({
        top: z.number().min(0),
        bottom: z.number().min(0),
        inner: z.number().min(0),
        outer: z.number().min(0)
      })
      .partial()
      .strict(),
    columns: z.number().int().min(1).max(MAX_GUIDE_COLUMNS),
    gutter: z.number().min(0),
    fold: z.boolean(),
    guides: z.null().describe('null removes the layout guides.')
  })
  .partial()
  .strict()

/** How a node takes part in a component; set by the operations, never typed in by hand. */
const componentLinksSchema = z.object({
  isComponent: z.boolean().optional(),
  sourceId: nodeIdSchema.optional(),
  overrides: z.array(z.string()).optional()
})

/** How a frame takes part in master pages: a master holds what pages share, a page names its master. */
const masterLinksSchema = z.object({
  isMaster: z
    .boolean()
    .optional()
    .describe(
      "Frames only: true makes the frame a master page. Its children are drawn on every page frame that names it in masterId, behind that page's own nodes, and a text with {page} shows each page's number."
    ),
  masterId: nodeIdSchema
    .nullable()
    .optional()
    .describe('Frames only: the id of the master frame this page uses; null stops using one.'),
  masterHidden: z
    .array(nodeIdSchema)
    .optional()
    .describe(
      'Frames only: ids of direct children of the master that this page does not show. A page replaces one by hiding it and drawing its own node.'
    )
})

const styleLinksSchema = z.object({
  bindings: z
    .record(z.string(), nodeIdSchema)
    .optional()
    .describe(
      'Maps a property to the id of a variable that sets it: a colour variable for fill or stroke, a number variable for fontSize, fontWeight, lineHeight, letterSpacing, opacity, cornerRadius, strokeWidth, blur, layoutGap or layoutPadding. Replaces all bindings of the node; {} unbinds them. Setting a bound property directly unbinds it.'
    ),
  textStyleId: nodeIdSchema
    .nullable()
    .optional()
    .describe(
      "Text only: the id of a text style whose font, size, weight, style, line height and letter spacing the text follows; null stops following one. A property set directly on the text stays the text's own."
    ),
  styleOverrides: z
    .array(z.string())
    .optional()
    .describe('The text style properties the text keeps for itself; [] makes it follow them all.')
})

/** A patch that may also bind properties to variables and set a text style. */
export const styledNodePatchSchema = nodePatchSchema.extend(styleLinksSchema.shape)

/** A patch that may also make a frame or group a component, or a frame a master, or use one. */
const nodeUpdateSchema = nodePatchSchema
  .extend({ isComponent: z.boolean().optional() })
  .extend(masterLinksSchema.shape)
  .extend(styleLinksSchema.shape)

// Files from before these properties existed have none, and read as a text with no spans and no list.
const storedNodeSchema = nodePatchSchema
  .required()
  .extend({
    spans: textSpansSchema.default([]),
    listStyle: z.enum(LIST_STYLES).default(DEFAULT_NODE_PROPERTIES.listStyle),
    listIndent: z
      .number()
      .min(MIN_LIST_INDENT)
      .max(MAX_LIST_INDENT)
      .default(DEFAULT_NODE_PROPERTIES.listIndent)
  })
  .extend(componentLinksSchema.shape)
  .extend(masterLinksSchema.shape)
  .extend(styleLinksSchema.shape)
  .extend({
    id: nodeIdSchema,
    type: z.enum(['page', 'frame', 'group', 'rectangle', 'ellipse', 'path', 'text', 'image']),
    parentId: nodeIdSchema.nullable(),
    order: z.number(),
    pdfTag: pdfTagSchema.optional()
  })

const MAX_METADATA_LENGTH = 500
const MAX_LANGUAGE_LENGTH = 35
const LANGUAGE_TAG_PATTERN = /^$|^[A-Za-z]{2,3}(?:-[\dA-Za-z]{2,8})*$/

export const documentMetadataSchema = z
  .object({
    title: z.string().max(MAX_METADATA_LENGTH),
    author: z.string().max(MAX_METADATA_LENGTH),
    subject: z.string().max(MAX_METADATA_LENGTH),
    // Empty clears it; anything else is a language tag such as `en` or `de-DE`.
    language: z.string().max(MAX_LANGUAGE_LENGTH).regex(LANGUAGE_TAG_PATTERN)
  })
  .partial()
  .strict()

export const variableSchema = z
  .object({
    id: nodeIdSchema,
    name: z.string().max(200),
    kind: z.enum(['color', 'number']),
    value: z
      .union([hexColorSchema, z.number().finite()])
      .describe('A hex colour for a colour variable, a number for a number variable.')
  })
  .strict()
  .describe('A named value that nodes reference through `bindings` instead of copying it.')

export const textStyleSchema = z
  .object({
    id: nodeIdSchema,
    name: z.string().max(200),
    fontFamily: z.string().max(200),
    fontSize: z.number().positive(),
    fontWeight: z.number().min(MIN_FONT_WEIGHT).max(MAX_FONT_WEIGHT),
    fontStyle: z.enum(FONT_STYLES),
    lineHeight: z.number().min(MIN_LINE_HEIGHT).max(MAX_LINE_HEIGHT),
    letterSpacing: z.number().min(MIN_LETTER_SPACING).max(MAX_LETTER_SPACING)
  })
  .strict()
  .describe(
    'A named bundle of type settings that a text follows through its `textStyleId`. lineHeight and letterSpacing are multiples of fontSize.'
  )

// The same limit core enforces when a comment is set.
const MAX_COMMENT_LENGTH = 10_000

export const commentSchema = z
  .object({
    id: nodeIdSchema,
    nodeId: nodeIdSchema.nullable(),
    x: z.number(),
    y: z.number(),
    text: z.string().min(1).max(MAX_COMMENT_LENGTH),
    author: z.string().max(200),
    createdAt: z.iso.datetime(),
    resolved: z.boolean()
  })
  .strict()
  .describe(
    "A note on the design. With nodeId, x and y are from that node's top left, so the pin follows it; with nodeId null they are on the page."
  )

export const storedDocumentSchema = z.object({
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  id: fileIdSchema,
  name: z.string(),
  metadata: documentMetadataSchema.optional(),
  variables: z.record(z.string(), variableSchema).optional(),
  textStyles: z.record(z.string(), textStyleSchema).optional(),
  comments: z.record(z.string(), commentSchema).optional(),
  rootId: nodeIdSchema,
  nodes: z.record(z.string(), storedNodeSchema)
})

export const documentSummaryListSchema = z.array(
  z.object({ id: fileIdSchema, name: z.string(), nodeCount: z.number() })
)

export const creatableNodeTypeSchema = z.enum([
  'frame',
  'group',
  'rectangle',
  'ellipse',
  'path',
  'text',
  'image'
])

export const operationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create'),
    id: nodeIdSchema.optional(),
    type: creatableNodeTypeSchema,
    parentId: nodeIdSchema,
    order: z.number().optional(),
    properties: styledNodePatchSchema.optional()
  }),
  z.object({
    kind: z.literal('createPage'),
    id: nodeIdSchema.optional(),
    order: z.number().optional(),
    properties: nodePatchSchema.optional()
  }),
  z.object({ kind: z.literal('update'), id: nodeIdSchema, patch: nodeUpdateSchema }),
  z.object({
    kind: z.literal('createInstance'),
    id: nodeIdSchema.optional(),
    componentId: nodeIdSchema,
    parentId: nodeIdSchema,
    order: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional()
  }),
  z.object({ kind: z.literal('detachInstance'), id: nodeIdSchema }),
  z.object({ kind: z.literal('resetOverrides'), id: nodeIdSchema }),
  z.object({ kind: z.literal('delete'), id: nodeIdSchema }),
  z.object({
    kind: z.literal('move'),
    id: nodeIdSchema,
    parentId: nodeIdSchema,
    order: z.number().optional()
  }),
  z.object({ kind: z.literal('reorderPage'), id: nodeIdSchema, order: z.number() }),
  z.object({ kind: z.literal('setVariable'), variable: variableSchema }),
  z.object({ kind: z.literal('deleteVariable'), id: nodeIdSchema }),
  z.object({ kind: z.literal('setTextStyle'), style: textStyleSchema }),
  z.object({ kind: z.literal('deleteTextStyle'), id: nodeIdSchema }),
  z.object({ kind: z.literal('setComment'), comment: commentSchema }),
  z.object({ kind: z.literal('deleteComment'), id: nodeIdSchema }),
  z.object({
    kind: z.literal('renameDocument'),
    name: z.string().trim().min(1).max(200).describe('The file name the file list shows.')
  }),
  z.object({
    kind: z.literal('updateMetadata'),
    patch: documentMetadataSchema.describe(
      'The PDF title, author, subject and language (a tag such as en or de-DE); an empty string clears a field.'
    )
  })
])

export const MAX_OPERATIONS_PER_BATCH = 500

export const operationBatchSchema = z
  .array(operationInputSchema)
  .min(1)
  .max(MAX_OPERATIONS_PER_BATCH)

const HTTPS_URL = /^https:\/\/\S+$/

const fontsourceFilesSchema = z.object({ url: z.object({ ttf: z.string().regex(HTTPS_URL) }) })

/**
 * A family as the Fontsource API describes it: its subsets with the characters each covers, and a
 * font file for every weight, style and subset.
 */
export const fontsourceFamilySchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1),
  subsets: z.array(z.string()),
  weights: z.array(z.number()),
  styles: z.array(z.string()),
  unicodeRange: z.record(z.string(), z.string()),
  variants: z.record(z.string(), z.record(z.string(), z.record(z.string(), fontsourceFilesSchema)))
})

/**
 * The families the Fontsource API lists, each with what a font picker needs to show it. The
 * weights and styles are empty when the list does not say, which the editor reads as unknown.
 */
export const fontsourceFamilyListSchema = z.array(
  z.object({
    id: z.string().min(1),
    family: z.string().min(1),
    category: z.string(),
    weights: z.array(z.number()).default([]),
    styles: z.array(z.string()).default([])
  })
)
