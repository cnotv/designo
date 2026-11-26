import { applyOperations, createDocument, type DesignDocument } from '@designo/core'

/**
 * Builds the second sample file, there so the demo can show deleting a file from the list.
 * @returns The sample document.
 */
export const createScratchDocument = (): DesignDocument => {
  const result = applyOperations(createDocument('sample-scratch', 'Sample: scratch', 'page'), [
    {
      kind: 'create',
      id: 'note',
      type: 'text',
      parentId: 'page',
      properties: { x: 40, y: 40, text: 'Delete this file from the list', fill: '#111111' }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}
