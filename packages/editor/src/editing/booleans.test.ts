import {
  applyOperations,
  createDocument,
  getChildren,
  getPathArea,
  type DesignDocument
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { createBooleanSelectionOperations } from './booleans.ts'

const apply = (
  document: DesignDocument,
  operations: Parameters<typeof applyOperations>[1]
): DesignDocument => {
  const result = applyOperations(document, operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const document = apply(createDocument('file', 'File', 'page'), [
  {
    kind: 'create',
    id: 'back',
    type: 'rectangle',
    parentId: 'page',
    properties: { x: 0, y: 0, width: 10, height: 10, fill: '#ff0000', name: 'Back' }
  },
  {
    kind: 'create',
    id: 'front',
    type: 'rectangle',
    parentId: 'page',
    properties: { x: 5, y: 5, width: 10, height: 10, fill: '#0000ff' }
  },
  {
    kind: 'create',
    id: 'label',
    type: 'text',
    parentId: 'page',
    properties: { x: 0, y: 0, width: 20, height: 10, text: 'Hi' }
  }
])

describe('createBooleanSelectionOperations', () => {
  it.each([
    ['union', 175],
    ['subtract', 75],
    ['intersect', 25],
    ['exclude', 150]
  ] as const)('%s replaces the shapes with one path of the right area', (operation, area) => {
    const change = createBooleanSelectionOperations(
      document,
      ['back', 'front'],
      operation,
      'result'
    )
    const next = apply(document, change.operations)
    expect(getChildren(next, 'page').map((node) => node.id)).toEqual(['result', 'label'])
    const result = next.nodes['result']
    expect(result?.type).toBe('path')
    expect(getPathArea(result?.pathData ?? '')).toBeCloseTo(area)
    expect(change.selection).toEqual(['result'])
  })

  it('takes the paint of the back shape and names the result after the operation', () => {
    const change = createBooleanSelectionOperations(document, ['front', 'back'], 'union', 'result')
    const result = apply(document, change.operations).nodes['result']
    expect(result?.fill).toBe('#ff0000')
    expect(result?.name).toBe('Union')
  })

  it('places the result where the shapes were', () => {
    const change = createBooleanSelectionOperations(document, ['back', 'front'], 'union', 'result')
    const result = apply(document, change.operations).nodes['result']
    expect([result?.x, result?.y, result?.width, result?.height]).toEqual([0, 0, 15, 15])
  })

  it('does nothing for fewer than two shapes', () => {
    expect(
      createBooleanSelectionOperations(document, ['back'], 'union', 'result').operations
    ).toEqual([])
  })

  it('does nothing when a selected node has no outline', () => {
    const change = createBooleanSelectionOperations(document, ['back', 'label'], 'union', 'result')
    expect(change.operations).toEqual([])
  })

  it('does nothing when the shapes have different parents', () => {
    const nested = apply(document, [
      { kind: 'create', id: 'frame', type: 'frame', parentId: 'page' },
      { kind: 'move', id: 'front', parentId: 'frame' }
    ])
    const change = createBooleanSelectionOperations(nested, ['back', 'front'], 'union', 'result')
    expect(change.operations).toEqual([])
  })
})
