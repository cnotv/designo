import {
  applyOperations,
  createDocument,
  getChildren,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { copySubtrees, createDuplicateOperations, createPasteOperations } from './clipboard.ts'
import { createGroupOperations, createUngroupOperations } from './grouping.ts'
import { createLayerOrderOperations } from './stacking.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const apply = (document: DesignDocument, operations: Parameters<typeof applyOperations>[1]) =>
  unwrap(applyOperations(document, operations))

const makeIdFactory = () => {
  const counter = { value: 0 }
  return (prefix: string): string => {
    counter.value += 1
    return `${prefix}-new${counter.value}`
  }
}

const idsOf = (document: DesignDocument, parentId: string): string[] =>
  getChildren(document, parentId).map((node) => node.id)

// A frame holding a box, beside three loose shapes a, b, c stacked in that order.
const document = apply(createDocument('file', 'File', 'page'), [
  {
    kind: 'create',
    id: 'frame',
    type: 'frame',
    parentId: 'page',
    properties: { x: 100, y: 100, width: 200, height: 200 }
  },
  {
    kind: 'create',
    id: 'box',
    type: 'rectangle',
    parentId: 'frame',
    properties: { x: 120, y: 120, width: 50, height: 50 }
  },
  ...['a', 'b', 'c'].map((id, index) => ({
    kind: 'create' as const,
    id,
    type: 'ellipse' as const,
    parentId: 'page',
    properties: { x: 400 + index * 100, y: 50, width: 40, height: 30 }
  }))
])

describe('duplicate and paste', () => {
  it('copies a frame with its descendants under new ids, shifted by ten', () => {
    const { operations, rootIds } = createDuplicateOperations(document, ['frame'], makeIdFactory())
    const result = apply(document, operations)
    expect(rootIds).toEqual(['frame-new1'])
    const copy = result.nodes['frame-new1']
    expect(copy).toMatchObject({ x: 110, y: 110, width: 200, parentId: 'page' })
    const [copiedBox] = getChildren(result, 'frame-new1')
    expect(copiedBox).toMatchObject({ x: 130, y: 130, type: 'rectangle' })
    expect(result.nodes['box']).toMatchObject({ x: 120, y: 120 })
  })

  it('places a duplicate on top of its siblings', () => {
    const { operations } = createDuplicateOperations(document, ['a'], makeIdFactory())
    expect(idsOf(apply(document, operations), 'page').at(-1)).toBe('ellipse-new1')
  })

  it('copies only the outermost of a nested selection', () => {
    expect(copySubtrees(document, ['frame', 'box'])?.rootIds).toEqual(['frame'])
  })

  it('copies nothing for the page or an empty selection', () => {
    expect(copySubtrees(document, ['page'])).toBeUndefined()
    expect(createDuplicateOperations(document, [], makeIdFactory()).operations).toEqual([])
  })

  it('pastes into the original parent, cascading with each paste', () => {
    const content = copySubtrees(document, ['box'])
    if (!content) throw new Error('nothing copied')
    const first = createPasteOperations(document, content, 0, makeIdFactory())
    const second = createPasteOperations(document, content, 1, makeIdFactory())
    expect(apply(document, first.operations).nodes['rectangle-new1']).toMatchObject({
      parentId: 'frame',
      x: 130
    })
    expect(apply(document, second.operations).nodes['rectangle-new1']).toMatchObject({ x: 140 })
  })

  it('pastes onto the page when the original parent is gone', () => {
    const content = copySubtrees(document, ['box'])
    if (!content) throw new Error('nothing copied')
    const withoutFrame = apply(document, [{ kind: 'delete', id: 'frame' }])
    const pasted = createPasteOperations(withoutFrame, content, 0, makeIdFactory())
    expect(apply(withoutFrame, pasted.operations).nodes['rectangle-new1']?.parentId).toBe('page')
  })
})

describe('group and ungroup', () => {
  it('wraps siblings in a group sized to their bounds, at the lowest position', () => {
    const { operations, selection } = createGroupOperations(document, ['b', 'c'], 'group-1')
    const result = apply(document, operations)
    expect(selection).toEqual(['group-1'])
    expect(result.nodes['group-1']).toMatchObject({ x: 500, y: 50, width: 140, height: 30 })
    expect(idsOf(result, 'page')).toEqual(['frame', 'a', 'group-1'])
    expect(idsOf(result, 'group-1')).toEqual(['b', 'c'])
  })

  it('refuses to group nodes from different parents', () => {
    expect(createGroupOperations(document, ['box', 'a'], 'group-1').operations).toEqual([])
  })

  it('lifts children out in place and deletes the group', () => {
    const grouped = apply(document, createGroupOperations(document, ['b'], 'group-1').operations)
    const { operations, selection } = createUngroupOperations(grouped, ['group-1'])
    const result = apply(grouped, operations)
    expect(selection).toEqual(['b'])
    expect(result.nodes['group-1']).toBeUndefined()
    expect(idsOf(result, 'page')).toEqual(idsOf(document, 'page'))
  })

  it('ungroups nothing when no group is selected', () => {
    expect(createUngroupOperations(document, ['a']).operations).toEqual([])
  })
})

describe('layer order', () => {
  const order = (mode: Parameters<typeof createLayerOrderOperations>[2], ids: string[]) =>
    idsOf(apply(document, createLayerOrderOperations(document, ids, mode)), 'page')

  it('steps one place forward and back', () => {
    expect(order('forward', ['a'])).toEqual(['frame', 'b', 'a', 'c'])
    expect(order('backward', ['c'])).toEqual(['frame', 'a', 'c', 'b'])
  })

  it('sends to the front and the back', () => {
    expect(order('front', ['a'])).toEqual(['frame', 'b', 'c', 'a'])
    expect(order('back', ['c'])).toEqual(['c', 'frame', 'a', 'b'])
  })

  it('moves a selection together, keeping its internal order', () => {
    expect(order('front', ['a', 'b'])).toEqual(['frame', 'c', 'a', 'b'])
    expect(order('forward', ['a', 'b'])).toEqual(['frame', 'c', 'a', 'b'])
    expect(order('back', ['b', 'c'])).toEqual(['b', 'c', 'frame', 'a'])
  })

  it('changes nothing at the end of the stack', () => {
    expect(createLayerOrderOperations(document, ['c'], 'front')).toEqual([])
    expect(createLayerOrderOperations(document, ['c'], 'forward')).toEqual([])
    expect(createLayerOrderOperations(document, ['frame'], 'back')).toEqual([])
  })

  it('moves only the one node it steps, using a midpoint', () => {
    expect(createLayerOrderOperations(document, ['a'], 'forward')).toEqual([
      { kind: 'move', id: 'a', parentId: 'page', order: 2.5 }
    ])
  })
})
