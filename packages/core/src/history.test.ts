import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from './document.ts'
import { invertOperations } from './history.ts'
import type { DesignDocument, DesignOperation, OperationResult } from './types.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const startingDocument = unwrap(
  applyOperations(createDocument('file', 'File', 'page'), [
    { kind: 'create', id: 'frame', type: 'frame', parentId: 'page', properties: { width: 400 } },
    {
      kind: 'create',
      id: 'box',
      type: 'rectangle',
      parentId: 'frame',
      properties: { x: 10, fill: '#ff0000' }
    },
    { kind: 'create', id: 'label', type: 'text', parentId: 'frame', properties: { text: 'Hi' } },
    { kind: 'create', id: 'group', type: 'group', parentId: 'page' }
  ])
)

const expectUndoRestores = (operations: DesignOperation[]): void => {
  const changed = unwrap(applyOperations(startingDocument, operations))
  const restored = unwrap(applyOperations(changed, invertOperations(startingDocument, operations)))
  expect(restored).toEqual(startingDocument)
}

describe('invertOperations', () => {
  it('undoes a create', () => {
    expectUndoRestores([{ kind: 'create', id: 'new', type: 'ellipse', parentId: 'page' }])
  })

  it('undoes an update, restoring only what changed', () => {
    expectUndoRestores([{ kind: 'update', id: 'box', patch: { x: 99, fill: null } }])
  })

  it('undoes deleting a frame, children and their order included', () => {
    expectUndoRestores([{ kind: 'delete', id: 'frame' }])
  })

  it('undoes a move', () => {
    expectUndoRestores([{ kind: 'move', id: 'box', parentId: 'group' }])
  })

  it('undoes a batch that builds on itself', () => {
    expectUndoRestores([
      { kind: 'create', id: 'card', type: 'frame', parentId: 'page' },
      { kind: 'create', id: 'title', type: 'text', parentId: 'card' },
      { kind: 'move', id: 'box', parentId: 'card' },
      { kind: 'update', id: 'title', patch: { text: 'Title' } },
      { kind: 'delete', id: 'label' }
    ])
  })
})
