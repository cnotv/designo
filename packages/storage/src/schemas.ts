import {
  BLEND_MODES,
  CURRENT_FORMAT_VERSION,
  FONT_STYLES,
  LAYOUT_ALIGNMENTS,
  LAYOUT_CROSS_ALIGNMENTS,
  LAYOUT_MODES,
  LAYOUT_SIZINGS,
  MAX_FONT_WEIGHT,
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MIN_FONT_WEIGHT,
  MIN_LETTER_SPACING,
  MIN_LINE_HEIGHT,
  PAGE_FACINGS,
  PAGE_UNITS,
  TEXT_ALIGNMENTS
} from '@designo/core'
import { z } from 'zod'

const MAX_TEXT_LENGTH = 10_000
const MAX_GUIDE_COLUMNS = 24

const HEX_COLOR = /^#(?:[\da-f]{6}|[\da-f]{8})$/i

export const fileIdSchema = z
  .string()
  .regex(/^[\w-]{1,64}$/, 'Letters, digits, - and _ only, at most 64 characters')

export const nodeIdSchema = z.string().regex(/^[\w:-]{1,64}$/, 'Letters, digits, :, - and _ only')

const hexColorSchema = z.string().regex(HEX_COLOR, 'A hex colour: #rrggbb or #rrggbbaa')

const colorSchema = hexColorSchema.nullable()

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
    imageAsset: assetIdSchema
      .nullable()
      .describe(
        'Images only: the id add_image returned for a stored picture. The picture is stretched to the width and height. null shows the fill as a placeholder.'
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
    pdfPage: z
      .number()
      .int()
      .min(1)
      .nullable()
      .describe(
        'Frames only: a whole number from 1 makes the frame a page of the exported PDF, at its own size, in that order; null (the default) leaves it out. Once any frame has a number, only numbered frames are printed.'
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
    guides: guidesSchema
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

/** A patch that may also make a frame or group a component, or stop it being one. */
const nodeUpdateSchema = nodePatchSchema.extend({ isComponent: z.boolean().optional() })

const storedNodeSchema = nodePatchSchema
  .required()
  .extend(componentLinksSchema.shape)
  .extend({
    id: nodeIdSchema,
    type: z.enum(['page', 'frame', 'group', 'rectangle', 'ellipse', 'text', 'image']),
    parentId: nodeIdSchema.nullable(),
    order: z.number()
  })

export const storedDocumentSchema = z.object({
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  id: fileIdSchema,
  name: z.string(),
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
    properties: nodePatchSchema.optional()
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
  z.object({ kind: z.literal('reorderPage'), id: nodeIdSchema, order: z.number() })
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
