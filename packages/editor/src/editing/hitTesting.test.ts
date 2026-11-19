import {
  applyOperations,
  createDocument,
  getPaintOrder,
  type DesignDocument,
  type DesignOperation
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { boundsIntersect, getNodeBounds } from './geometry.ts'
import { rotatedBoundsContainPoint } from './rotation.ts'
import { findContainerAtPoint, findNodeAtPoint, findNodesInBounds } from './selection.ts'
import { getDrawnBounds, indexDocument, searchSpatialEntries } from './spatialIndex.ts'

const build = (operations: DesignOperation[]): DesignDocument => {
  const result = applyOperations(createDocument('file', 'File', 'page'), operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const rectangle = (
  id: string,
  parentId: string,
  properties: Record<string, number | boolean>
): DesignOperation => ({ kind: 'create', id, type: 'rectangle', parentId, properties })

const pickAt = (document: DesignDocument, x: number, y: number): string | undefined =>
  findNodeAtPoint(document, indexDocument(document), { x, y })?.id

describe('hit testing through the spatial index', () => {
  it('picks the later sibling where two nodes overlap', () => {
    const document = build([
      rectangle('under', 'page', { x: 0, y: 0, width: 100, height: 100 }),
      rectangle('over', 'page', { x: 50, y: 50, width: 100, height: 100 })
    ])
    expect(pickAt(document, 75, 75)).toBe('over')
    expect(pickAt(document, 10, 10)).toBe('under')
  })

  it('picks a child in a nested frame only inside every clipping frame', () => {
    const document = build([
      {
        kind: 'create',
        id: 'outer',
        type: 'frame',
        parentId: 'page',
        properties: { width: 100, height: 100 }
      },
      {
        kind: 'create',
        id: 'inner',
        type: 'frame',
        parentId: 'outer',
        properties: { x: 50, y: 50, width: 100, height: 100 }
      },
      rectangle('leaf', 'inner', { x: 40, y: 40, width: 200, height: 200 })
    ])
    expect(pickAt(document, 75, 75)).toBe('leaf')
    expect(pickAt(document, 120, 120)).toBeUndefined()
    expect(findContainerAtPoint(document, indexDocument(document), { x: 75, y: 75 })).toBe('inner')
    expect(findContainerAtPoint(document, indexDocument(document), { x: 20, y: 20 })).toBe('outer')
  })

  it('skips a hidden node and everything inside a hidden frame', () => {
    const document = build([
      rectangle('hidden', 'page', { x: 0, y: 0, width: 50, height: 50, visible: false }),
      {
        kind: 'create',
        id: 'ghost',
        type: 'frame',
        parentId: 'page',
        properties: { x: 100, y: 0, width: 50, height: 50, visible: false }
      },
      rectangle('inside', 'ghost', { x: 100, y: 0, width: 50, height: 50 })
    ])
    expect(pickAt(document, 25, 25)).toBeUndefined()
    expect(pickAt(document, 125, 25)).toBeUndefined()
    expect(
      findNodesInBounds(document, indexDocument(document), {
        x: -10,
        y: -10,
        width: 500,
        height: 500
      })
    ).toEqual([])
  })

  it('answers every point and marquee the same as walking every node', () => {
    const document = build(
      Array.from({ length: 400 }, (_, position) =>
        rectangle(`node-${position}`, 'page', {
          x: (position * 137) % 2000,
          y: (position * 251) % 2000,
          width: 20 + ((position * 31) % 150),
          height: 20 + ((position * 17) % 150),
          rotation: (position * 29) % 90
        })
      )
    )
    const index = indexDocument(document)
    const everyNode = getPaintOrder(document)
    Array.from({ length: 300 }, (_, step) => ({
      x: (step * 97) % 2100,
      y: (step * 61) % 2100
    })).forEach((point) => {
      const expected = everyNode.findLast((node) =>
        rotatedBoundsContainPoint(getNodeBounds(node), node.rotation, point)
      )
      expect(findNodeAtPoint(document, index, point)?.id).toBe(expected?.id)
    })
    const marquee = { x: 300, y: 300, width: 400, height: 250 }
    expect(findNodesInBounds(document, index, marquee)).toEqual(
      everyNode
        .filter((node) => boundsIntersect(getDrawnBounds(node), marquee))
        .map((node) => node.id)
    )
  })

  it('reads only the entries near a point, however many nodes there are', () => {
    const document = build(
      Array.from({ length: 2000 }, (_, position) =>
        rectangle(`node-${position}`, 'page', {
          x: (position % 50) * 100,
          y: Math.floor(position / 50) * 100,
          width: 80,
          height: 80
        })
      )
    )
    const visited = searchSpatialEntries(indexDocument(document), {
      x: 1010,
      y: 1010,
      width: 0,
      height: 0
    })
    expect(visited.length).toBeLessThan(5)
  })
})
