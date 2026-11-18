import {
  BLEND_MODES,
  CURRENT_FORMAT_VERSION,
  MAX_LINE_HEIGHT,
  MIN_LINE_HEIGHT
} from '@designo/core'
import { z } from 'zod'

const MAX_TEXT_LENGTH = 10_000

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
    text: z.string().max(MAX_TEXT_LENGTH),
    fontSize: z.number().positive(),
    fontFamily: z.string().max(200),
    textAlign: z
      .enum(['left', 'center', 'right'])
      .describe('Text only: which edge lines sit against inside the width. Default left.'),
    lineHeight: z
      .number()
      .min(MIN_LINE_HEIGHT)
      .max(MAX_LINE_HEIGHT)
      .describe('Text only: distance between lines as a multiple of fontSize. Default 1.2.'),
    textWrap: z
      .boolean()
      .describe(
        'Text only: true makes the node a fixed-width box whose lines wrap at its width; false (the default) sizes the box to its text.'
      )
  })
  .partial()
  .strict()

const storedNodeSchema = nodePatchSchema.required().extend({
  id: nodeIdSchema,
  type: z.enum(['page', 'frame', 'group', 'rectangle', 'ellipse', 'text']),
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

export const creatableNodeTypeSchema = z.enum(['frame', 'group', 'rectangle', 'ellipse', 'text'])

export const operationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create'),
    id: nodeIdSchema.optional(),
    type: creatableNodeTypeSchema,
    parentId: nodeIdSchema,
    order: z.number().optional(),
    properties: nodePatchSchema.optional()
  }),
  z.object({ kind: z.literal('update'), id: nodeIdSchema, patch: nodePatchSchema }),
  z.object({ kind: z.literal('delete'), id: nodeIdSchema }),
  z.object({
    kind: z.literal('move'),
    id: nodeIdSchema,
    parentId: nodeIdSchema,
    order: z.number().optional()
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

/** The families the Fontsource API lists, each with what a font picker needs to show it. */
export const fontsourceFamilyListSchema = z.array(
  z.object({ id: z.string().min(1), family: z.string().min(1), category: z.string() })
)
