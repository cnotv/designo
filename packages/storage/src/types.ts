import type { DesignDocument } from '@designo/core'
import type { z } from 'zod'
import type { operationInputSchema } from './schemas.ts'

export interface DocumentSummary {
  id: string
  name: string
  nodeCount: number
}

/** An operation as an agent or the editor sends it: a create may leave its id to the server. */
export type OperationInput = z.infer<typeof operationInputSchema>

export type GenerateId = (prefix: string) => string

export interface AppliedBatch {
  document: DesignDocument
  createdNodeIds: string[]
}
