import { applyOperations, type DesignOperation } from '@designo/core'
import { readDocument, writeDocument } from './store.ts'
import type { AppliedBatch, GenerateId, OperationInput } from './types.ts'

const withGeneratedIds = (
  operations: readonly OperationInput[],
  generateId: GenerateId
): DesignOperation[] =>
  operations.map((operation) =>
    operation.kind === 'create'
      ? { ...operation, id: operation.id ?? generateId(operation.type) }
      : operation
  )

const createdIds = (operations: readonly DesignOperation[]): string[] =>
  operations.flatMap((operation) => (operation.kind === 'create' ? [operation.id] : []))

/**
 * Applies a batch of operations to a file on disk as one change: nothing is saved if any fails.
 * The MCP server and the editor's write endpoint both save through here.
 * @param dataDirectory - Where Designo files live.
 * @param fileId - The file to change.
 * @param operations - The changes, in order, already validated.
 * @param generateId - Makes ids for created nodes that came without one.
 * @returns The saved document and the ids of the nodes the batch created.
 */
export const applyOperationsToFile = async (
  dataDirectory: string,
  fileId: string,
  operations: readonly OperationInput[],
  generateId: GenerateId
): Promise<AppliedBatch> => {
  const document = await readDocument(dataDirectory, fileId)
  const operationsWithIds = withGeneratedIds(operations, generateId)
  const result = applyOperations(document, operationsWithIds)
  if (!result.ok) throw new Error(result.error)
  await writeDocument(dataDirectory, result.document)
  return { document: result.document, createdNodeIds: createdIds(operationsWithIds) }
}
