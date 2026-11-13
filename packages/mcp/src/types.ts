import type { z } from 'zod'
import type { operationInputSchema } from './schemas.ts'

export type OperationInput = z.infer<typeof operationInputSchema>

export type GenerateId = (prefix: string) => string

export interface DesignoToolContext {
  dataDirectory: string
  generateId: GenerateId
}
