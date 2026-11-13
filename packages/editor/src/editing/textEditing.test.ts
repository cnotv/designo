import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { createTextCommitOperations, getTextOverlayLayout } from './textEditing.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const document = unwrap(
  applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'label',
      type: 'text',
      parentId: 'page',
      properties: { x: 100, y: 50, width: 40, height: 20, text: 'Hi', fontSize: 16, rotation: 30 }
    }
  ])
)
const label = document.nodes['label']!

describe('getTextOverlayLayout', () => {
  it('follows the node through pan and zoom', () => {
    const layout = getTextOverlayLayout(label, { offsetX: 10, offsetY: 20, scale: 2 }, 'Hi')
    expect(layout).toMatchObject({
      left: 210,
      top: 120,
      fontSize: 32,
      lineHeight: 40,
      rotation: 30
    })
  })

  it('grows with the draft lines and longest line', () => {
    const viewport = { offsetX: 0, offsetY: 0, scale: 1 }
    const single = getTextOverlayLayout(label, viewport, 'Hi')
    const grown = getTextOverlayLayout(label, viewport, 'a much longer first line\nsecond')
    expect(grown.height).toBeGreaterThan(single.height)
    expect(grown.width).toBeGreaterThan(single.width)
  })
})

describe('createTextCommitOperations', () => {
  it('commits changed text as one update', () => {
    const operations = createTextCommitOperations(
      document,
      { nodeId: 'label', isNew: false },
      'one\ntwo'
    )
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      kind: 'update',
      id: 'label',
      patch: { text: 'one\ntwo' }
    })
  })

  it('fits the node height to the lines', () => {
    const [operation] = createTextCommitOperations(
      document,
      { nodeId: 'label', isNew: false },
      'one\ntwo\nthree'
    )
    expect(operation).toMatchObject({ patch: { height: 60 } })
  })

  it('does nothing when the text is unchanged', () => {
    expect(createTextCommitOperations(document, { nodeId: 'label', isNew: false }, 'Hi')).toEqual(
      []
    )
  })

  it('deletes a new node left empty', () => {
    expect(createTextCommitOperations(document, { nodeId: 'label', isNew: true }, '  \n')).toEqual([
      { kind: 'delete', id: 'label' }
    ])
  })

  it('keeps a new node that has text, even when it equals the placeholder', () => {
    const operations = createTextCommitOperations(document, { nodeId: 'label', isNew: true }, 'Hi')
    expect(operations).toHaveLength(1)
  })

  it('gives nothing for a node that is gone', () => {
    expect(createTextCommitOperations(document, { nodeId: 'gone', isNew: false }, 'x')).toEqual([])
  })
})
