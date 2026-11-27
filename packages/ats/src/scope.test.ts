import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from '@designo/core'
import { getPlacedNodes } from './scope.ts'

describe('getPlacedNodes', () => {
  const result = applyOperations(createDocument('f', 'Book', 'page'), [
    {
      kind: 'create',
      id: 'second',
      type: 'frame',
      parentId: 'page',
      properties: { x: 900, y: 50, width: 600, height: 800, pdfPage: 2 }
    },
    {
      kind: 'create',
      id: 'first',
      type: 'frame',
      parentId: 'page',
      properties: { x: 0, y: 0, width: 600, height: 800, pdfPage: 1 }
    },
    {
      kind: 'create',
      id: 'note',
      type: 'text',
      parentId: 'second',
      properties: { x: 940, y: 90, width: 100, height: 20, text: 'Hello' }
    },
    {
      kind: 'create',
      id: 'hidden',
      type: 'text',
      parentId: 'first',
      properties: { x: 10, y: 10, width: 100, height: 20, text: 'Gone', visible: false }
    }
  ])
  if (!result.ok) throw new Error(result.error)

  it('measures a node from the corner of its page frame, on the right page', () => {
    expect(getPlacedNodes(result.document)).toEqual([
      expect.objectContaining({
        page: 2,
        box: { x: 40, y: 40, width: 100, height: 20 },
        pageBox: { x: 0, y: 0, width: 600, height: 800 }
      })
    ])
  })
})
