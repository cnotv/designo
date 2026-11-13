import { nodeIdSchema, nodePatchSchema } from '@designo/storage'
import { z } from 'zod'

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
