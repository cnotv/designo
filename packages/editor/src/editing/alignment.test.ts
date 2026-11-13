import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  canAlign,
  canDistribute,
  createAlignOperations,
  createDistributeOperations
} from './alignment.ts'
import { getNodeBounds } from './geometry.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const rectangle = (id: string, parentId: string, x: number, y: number, size = 20) => ({
  kind: 'create' as const,
  id,
  type: 'rectangle' as const,
  parentId,
  properties: { x, y, width: size, height: size }
})

// Three boxes on the page at uneven spacing, and a frame holding one more.
const document = unwrap(
  applyOperations(createDocument('file', 'File', 'page'), [
    rectangle('a', 'page', 0, 0, 20),
    rectangle('b', 'page', 50, 40, 40),
    rectangle('c', 'page', 200, 100, 20),
    {
      kind: 'create',
      id: 'frame',
      type: 'frame',
      parentId: 'page',
      properties: { x: 500, y: 500, width: 300, height: 200 }
    },
    rectangle('inside', 'frame', 520, 520, 40)
  ])
)

const applied = (operations: Parameters<typeof applyOperations>[1]): DesignDocument =>
  unwrap(applyOperations(document, operations))

// Where a fraction of each node's extent lies along an axis: 0 start edge, 0.5 centre, 1 end edge.
const lineOf = (
  result: DesignDocument,
  ids: readonly string[],
  axis: 'x' | 'y',
  fraction: number
): number[] =>
  ids.map((id) => {
    const bounds = getNodeBounds(result.nodes[id]!)
    return axis === 'x' ? bounds.x + bounds.width * fraction : bounds.y + bounds.height * fraction
  })

describe('align', () => {
  it('aligns the left edges to the selection bounds', () => {
    const next = applied(createAlignOperations(document, ['a', 'b', 'c'], 'left'))
    expect(['a', 'b', 'c'].map((id) => next.nodes[id]?.x)).toEqual([0, 0, 0])
  })

  it('aligns the right edges and the centres', () => {
    const right = applied(createAlignOperations(document, ['a', 'b', 'c'], 'right'))
    expect(lineOf(right, ['a', 'b', 'c'], 'x', 1)).toEqual([220, 220, 220])
    const centre = applied(createAlignOperations(document, ['a', 'b', 'c'], 'centerX'))
    expect(lineOf(centre, ['a', 'b', 'c'], 'x', 0.5)).toEqual([110, 110, 110])
  })

  it('aligns tops, vertical centres and bottoms', () => {
    const top = applied(createAlignOperations(document, ['a', 'b', 'c'], 'top'))
    expect(lineOf(top, ['a', 'b', 'c'], 'y', 0)).toEqual([0, 0, 0])
    const middle = applied(createAlignOperations(document, ['a', 'b', 'c'], 'centerY'))
    expect(lineOf(middle, ['a', 'b', 'c'], 'y', 0.5)).toEqual([60, 60, 60])
    const bottom = applied(createAlignOperations(document, ['a', 'b', 'c'], 'bottom'))
    expect(lineOf(bottom, ['a', 'b', 'c'], 'y', 1)).toEqual([120, 120, 120])
  })

  it('aligns a single node to the frame holding it', () => {
    const next = applied(createAlignOperations(document, ['inside'], 'right'))
    expect(next.nodes.inside?.x).toBe(760)
    const centred = applied(createAlignOperations(document, ['inside'], 'centerY'))
    expect(centred.nodes.inside?.y).toBe(580)
  })

  it('does nothing for a lone node on the page', () => {
    expect(createAlignOperations(document, ['a'], 'left')).toEqual([])
    expect(canAlign(document, ['a'])).toBe(false)
    expect(canAlign(document, ['inside'])).toBe(true)
    expect(canAlign(document, ['a', 'b'])).toBe(true)
  })

  it('carries what a frame holds when it moves', () => {
    const next = applied(createAlignOperations(document, ['a', 'frame'], 'left'))
    expect(next.nodes.frame?.x).toBe(0)
    expect(next.nodes.inside?.x).toBe(20)
  })
})

describe('distribute', () => {
  it('leaves equal gaps between the nodes, keeping the outer two in place', () => {
    const next = applied(createDistributeOperations(document, ['c', 'a', 'b'], 'horizontal'))
    const [firstStart, secondStart, thirdStart] = lineOf(next, ['a', 'b', 'c'], 'x', 0)
    const [firstEnd, secondEnd] = lineOf(next, ['a', 'b', 'c'], 'x', 1)
    expect(firstStart).toBe(0)
    expect(thirdStart).toBe(200)
    expect(secondStart! - firstEnd!).toBe(70)
    expect(thirdStart! - secondEnd!).toBe(70)
  })

  it('distributes vertically', () => {
    const next = applied(createDistributeOperations(document, ['a', 'b', 'c'], 'vertical'))
    expect(next.nodes.b?.y).toBe(40)
    expect(next.nodes.a?.y).toBe(0)
  })

  it('needs three nodes', () => {
    expect(createDistributeOperations(document, ['a', 'b'], 'horizontal')).toEqual([])
    expect(canDistribute(document, ['a', 'b'])).toBe(false)
    expect(canDistribute(document, ['a', 'b', 'c'])).toBe(true)
  })
})
