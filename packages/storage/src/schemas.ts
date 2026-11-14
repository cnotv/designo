import { CURRENT_FORMAT_VERSION } from '@designo/core'
import { z } from 'zod'

const MAX_TEXT_LENGTH = 10_000

const HEX_COLOR = /^#(?:[\da-f]{6}|[\da-f]{8})$/i

export const fileIdSchema = z
  .string()
  .regex(/^[\w-]{1,64}$/, 'Letters, digits, - and _ only, at most 64 characters')

export const nodeIdSchema = z.string().regex(/^[\w:-]{1,64}$/, 'Letters, digits, :, - and _ only')

const colorSchema = z.string().regex(HEX_COLOR, 'A hex colour: #rrggbb or #rrggbbaa').nullable()

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
    stroke: colorSchema,
    strokeWidth: z.number().min(0),
    cornerRadius: z.number().min(0),
    text: z.string().max(MAX_TEXT_LENGTH),
    fontSize: z.number().positive(),
    fontFamily: z.string().max(200)
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
