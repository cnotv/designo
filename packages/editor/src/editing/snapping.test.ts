import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { getSnapTargets, snapMove, snapResize } from './snapping.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

// A frame at (0, 0) of 400 x 300 holding a mover and two siblings, and a box on the page.
const document = unwrap(
  applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'frame',
      type: 'frame',
      parentId: 'page',
      properties: { x: 0, y: 0, width: 400, height: 300 }
    },
    {
      kind: 'create',
      id: 'mover',
      type: 'rectangle',
      parentId: 'frame',
      properties: { x: 50, y: 50, width: 40, height: 40 }
    },
    {
      kind: 'create',
      id: 'sibling',
      type: 'rectangle',
      parentId: 'frame',
      properties: { x: 200, y: 100, width: 60, height: 60 }
    },
    {
      kind: 'create',
      id: 'hidden',
      type: 'rectangle',
      parentId: 'frame',
      properties: { x: 90, y: 200, width: 10, height: 10, visible: false }
    },
    {
      kind: 'create',
      id: 'outside',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 600, y: 600, width: 10, height: 10 }
    }
  ])
)

describe('snap targets', () => {
  it('are the visible siblings and the frame, never the dragged node or other parents', () => {
    expect(getSnapTargets(document, ['mover'])).toEqual([
      { x: 200, y: 100, width: 60, height: 60 },
      { x: 0, y: 0, width: 400, height: 300 }
    ])
  })
})

describe('snapMove', () => {
  it('snaps the left edge to a sibling edge within the threshold', () => {
    // The mover's right edge would land at 196; the sibling's left edge is at 200.
    const result = snapMove(document, ['mover'], { x: 106, y: 0 }, 6)
    expect(result.delta.x).toBe(110)
    expect(result.guides).toContainEqual({
      orientation: 'vertical',
      position: 200,
      start: 0,
      end: 300
    })
  })

  it('snaps centres together', () => {
    // Sibling centre y is 130; the mover centre would be 127, 3 short of it.
    const result = snapMove(document, ['mover'], { x: 0, y: 57 }, 6)
    expect(result.delta.y).toBe(60)
  })

  it('snaps to the parent frame edges', () => {
    const result = snapMove(document, ['mover'], { x: -47, y: 0 }, 6)
    expect(result.delta.x).toBe(-50)
  })

  it('does not snap outside the threshold', () => {
    const result = snapMove(document, ['mover'], { x: 20, y: 20 }, 6)
    expect(result.delta).toEqual({ x: 20, y: 20 })
    expect(result.guides).toEqual([])
  })

  it('scales the threshold, so it is the same on screen at any zoom', () => {
    const near = snapMove(document, ['mover'], { x: 104, y: 0 }, 6 / 4)
    expect(near.delta.x).toBe(104)
  })
})

describe('snapResize', () => {
  it('snaps only the edge the handle moves', () => {
    const start = { x: 50, y: 50, width: 40, height: 40 }
    // Dragging the east edge from 90 to 197 lands 3 short of the sibling's left edge at 200.
    const result = snapResize(document, {
      nodeId: 'mover',
      startBounds: start,
      handle: 'e',
      delta: { x: 107, y: 3 },
      threshold: 6
    })
    expect(result.delta.x).toBe(110)
    expect(result.delta.y).toBe(3)
  })

  it('snaps the north edge to the frame top', () => {
    const start = { x: 50, y: 50, width: 40, height: 40 }
    const result = snapResize(document, {
      nodeId: 'mover',
      startBounds: start,
      handle: 'n',
      delta: { x: 0, y: -47 },
      threshold: 6
    })
    expect(result.delta.y).toBe(-50)
    expect(result.guides[0]?.orientation).toBe('horizontal')
  })
})
