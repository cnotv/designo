import { describe, expect, it } from 'vitest'
import {
  applyOperation,
  applyOperations,
  createDocument,
  getChildren,
  getNodeTree,
  getPaintOrder
} from './document.ts'
import type { DesignDocument, OperationResult } from './types.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const emptyDocument = createDocument('file-1', 'Test file', 'page-1')

const documentWithFrame = unwrap(
  applyOperations(emptyDocument, [
    { kind: 'create', id: 'frame-1', type: 'frame', parentId: 'page-1' },
    {
      kind: 'create',
      id: 'rect-1',
      type: 'rectangle',
      parentId: 'frame-1',
      properties: { fill: '#ff0000' }
    },
    {
      kind: 'create',
      id: 'text-1',
      type: 'text',
      parentId: 'frame-1',
      properties: { text: 'Hello' }
    }
  ])
)

describe('createDocument', () => {
  it('starts with one page as the root', () => {
    expect(emptyDocument.rootId).toBe('page-1')
    expect(emptyDocument.nodes['page-1']?.type).toBe('page')
  })
})

describe('applyOperation', () => {
  it('creates a node with defaults and the given properties', () => {
    const rectangle = documentWithFrame.nodes['rect-1']
    expect(rectangle?.fill).toBe('#ff0000')
    expect(rectangle?.width).toBe(100)
    expect(rectangle?.parentId).toBe('frame-1')
  })

  it('appends new siblings after existing ones', () => {
    expect(getChildren(documentWithFrame, 'frame-1').map((node) => node.id)).toEqual([
      'rect-1',
      'text-1'
    ])
  })

  it('never mutates the input document', () => {
    applyOperation(emptyDocument, {
      kind: 'create',
      id: 'rect-9',
      type: 'rectangle',
      parentId: 'page-1'
    })
    expect(Object.keys(emptyDocument.nodes)).toEqual(['page-1'])
  })

  it('refuses a child under a leaf node', () => {
    const result = applyOperation(documentWithFrame, {
      kind: 'create',
      id: 'rect-2',
      type: 'rectangle',
      parentId: 'rect-1'
    })
    expect(result.ok).toBe(false)
  })

  it('updates only the patched properties', () => {
    const updated = unwrap(
      applyOperation(documentWithFrame, { kind: 'update', id: 'rect-1', patch: { x: 40 } })
    )
    expect(updated.nodes['rect-1']?.x).toBe(40)
    expect(updated.nodes['rect-1']?.fill).toBe('#ff0000')
  })

  it('deletes a node with its whole subtree', () => {
    const updated = unwrap(applyOperation(documentWithFrame, { kind: 'delete', id: 'frame-1' }))
    expect(Object.keys(updated.nodes)).toEqual(['page-1'])
  })

  it('refuses to delete the root page', () => {
    expect(applyOperation(documentWithFrame, { kind: 'delete', id: 'page-1' }).ok).toBe(false)
  })

  it('refuses to move a node inside itself', () => {
    const withGroup = unwrap(
      applyOperation(documentWithFrame, {
        kind: 'create',
        id: 'group-1',
        type: 'group',
        parentId: 'frame-1'
      })
    )
    expect(applyOperation(withGroup, { kind: 'move', id: 'frame-1', parentId: 'group-1' }).ok).toBe(
      false
    )
  })
})

describe('applyOperations', () => {
  it('applies nothing when one operation in the batch fails', () => {
    const result = applyOperations(documentWithFrame, [
      { kind: 'update', id: 'rect-1', patch: { x: 10 } },
      { kind: 'delete', id: 'missing' }
    ])
    expect(result).toEqual({ ok: false, error: 'Operation 1: Node missing does not exist' })
  })
})

describe('getNodeTree', () => {
  it('stops at the requested depth', () => {
    const shallowTree = getNodeTree(documentWithFrame, 'page-1', 1)
    expect(shallowTree?.children.map((child) => child.node.id)).toEqual(['frame-1'])
    expect(shallowTree?.children[0]?.children).toEqual([])
  })
})

describe('getPaintOrder', () => {
  it('lists parents before children and skips hidden nodes', () => {
    const withHiddenText = unwrap(
      applyOperation(documentWithFrame, { kind: 'update', id: 'text-1', patch: { visible: false } })
    )
    expect(getPaintOrder(withHiddenText).map((node) => node.id)).toEqual(['frame-1', 'rect-1'])
  })
})
