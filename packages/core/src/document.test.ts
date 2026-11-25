import { describe, expect, it } from 'vitest'
import {
  applyOperation,
  applyOperations,
  createDocument,
  getChildren,
  getNodeTree,
  getPageNodes,
  getPaintOrder
} from './document.ts'
import { invertOperations } from './history.ts'
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

describe('pages', () => {
  it('adds pages after the first, in order, each with no parent', () => {
    const document = unwrap(
      applyOperations(emptyDocument, [
        { kind: 'createPage', id: 'page-3' },
        { kind: 'createPage', id: 'page-2', order: 0.5 }
      ])
    )
    expect(getPageNodes(document).map((page) => page.id)).toEqual(['page-1', 'page-2', 'page-3'])
    expect(document.nodes['page-3']).toMatchObject({ type: 'page', parentId: null, name: 'Page 2' })
  })

  it('reorders pages, refuses anything but a page, and undoes', () => {
    const three = unwrap(
      applyOperations(emptyDocument, [
        { kind: 'createPage', id: 'page-2' },
        { kind: 'createPage', id: 'page-3' }
      ])
    )
    const moved = unwrap(applyOperation(three, { kind: 'reorderPage', id: 'page-3', order: -1 }))
    expect(getPageNodes(moved).map((page) => page.id)).toEqual(['page-3', 'page-1', 'page-2'])
    const undone = unwrap(
      applyOperations(
        moved,
        invertOperations(three, [{ kind: 'reorderPage', id: 'page-3', order: -1 }])
      )
    )
    expect(getPageNodes(undone).map((page) => page.id)).toEqual(['page-1', 'page-2', 'page-3'])
    expect(
      applyOperation(documentWithFrame, { kind: 'reorderPage', id: 'frame-1', order: 0 }).ok
    ).toBe(false)
  })

  it('holds nodes on a page other than the first, and refuses a repeated id', () => {
    const document = unwrap(
      applyOperations(emptyDocument, [
        { kind: 'createPage', id: 'page-2' },
        { kind: 'create', id: 'box', type: 'rectangle', parentId: 'page-2' }
      ])
    )
    expect(getChildren(document, 'page-2').map((node) => node.id)).toEqual(['box'])
    expect(applyOperation(document, { kind: 'createPage', id: 'page-2' }).ok).toBe(false)
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

  it('reads the children of the document it is given, not of an earlier one', () => {
    const before = getChildren(documentWithFrame, 'frame-1')
    const after = unwrap(applyOperation(documentWithFrame, { kind: 'delete', id: 'rect-1' }))
    expect(getChildren(after, 'frame-1').map((node) => node.id)).toEqual(['text-1'])
    expect(before.map((node) => node.id)).toEqual(['rect-1', 'text-1'])
  })

  it('lists no children under a leaf', () => {
    expect(getChildren(documentWithFrame, 'rect-1')).toEqual([])
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

  it('refuses to delete the only page', () => {
    expect(applyOperation(documentWithFrame, { kind: 'delete', id: 'page-1' }).ok).toBe(false)
  })

  it('deletes the root page when another remains, which becomes the root', () => {
    const twoPages = unwrap(applyOperation(documentWithFrame, { kind: 'createPage', id: 'page-2' }))
    const updated = unwrap(applyOperation(twoPages, { kind: 'delete', id: 'page-1' }))
    expect(updated.rootId).toBe('page-2')
    expect(Object.keys(updated.nodes)).toEqual(['page-2'])
  })

  it('moves a node to the given index among its new siblings, even when orders tie', () => {
    const withSecond = unwrap(
      applyOperation(documentWithFrame, {
        kind: 'create',
        id: 'rect-2',
        type: 'rectangle',
        parentId: 'frame-1',
        order: 0
      })
    )
    const moved = unwrap(
      applyOperation(withSecond, { kind: 'move', id: 'rect-2', parentId: 'frame-1', order: 0 })
    )
    expect(getChildren(moved, 'frame-1').map((child) => child.id)).toEqual([
      'rect-2',
      'rect-1',
      'text-1'
    ])
    const toEnd = unwrap(
      applyOperation(moved, { kind: 'move', id: 'rect-2', parentId: 'frame-1', order: 9 })
    )
    expect(getChildren(toEnd, 'frame-1').map((child) => child.id)).toEqual([
      'rect-1',
      'text-1',
      'rect-2'
    ])
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
