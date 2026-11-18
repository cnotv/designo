import type { DesignDocument } from '@designo/core'
import type { z } from 'zod'
import type {
  fontsourceFamilyListSchema,
  fontsourceFamilySchema,
  operationInputSchema
} from './schemas.ts'

export interface DocumentSummary {
  id: string
  name: string
  nodeCount: number
}

/** An operation as an agent or the editor sends it: a create may leave its id to the server. */
export type OperationInput = z.infer<typeof operationInputSchema>

export type GenerateId = (prefix: string) => string

/** One raw JSON object, before it is known to match any schema. */
export type RawDocument = Record<string, unknown>

/** Turns a raw document of one format version into the next version up. */
export type MigrationStep = (raw: RawDocument) => RawDocument

/** Migration steps keyed by the version they upgrade from. */
export type MigrationSteps = Readonly<Record<number, MigrationStep>>

export interface AppliedBatch {
  document: DesignDocument
  createdNodeIds: string[]
}

/** A family as the Fontsource API describes it, once validated. */
export type FontsourceFamily = z.infer<typeof fontsourceFamilySchema>

/** A family in the Fontsource list: its id, its name and its category, such as `serif`. */
export type FontsourceFamilySummary = z.infer<typeof fontsourceFamilyListSchema>[number]
