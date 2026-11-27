import { getPathArea, getPathBounds } from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  CLOSE_DISTANCE_PX,
  createPathDraftOperation,
  getPenPathData,
  isNearFirstPoint,
  removeRepeatedPoints
} from './pathTools.ts'
import type { PathDraft } from './types.ts'

const draft = (points: PathDraft['points'], tool: PathDraft['tool'] = 'polygon'): PathDraft => ({
  tool,
  nodeId: 'path-1',
  parentId: 'page',
  points
})

describe('getPenPathData', () => {
  it('joins straight points with lines', () => {
    expect(
      getPenPathData(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 }
        ],
        false
      )
    ).toBe('M0,0L10,0L10,10')
  })

  it('closes the outline back to the first point', () => {
    expect(
      getPenPathData(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 }
        ],
        true
      )
    ).toBe('M0,0L10,0L10,10Z')
  })

  it('leaves a point along its handle and arrives mirrored at the next', () => {
    const data = getPenPathData(
      [
        { x: 0, y: 0, handleOut: { x: 0, y: 10 } },
        { x: 10, y: 0, handleOut: { x: 10, y: -10 } }
      ],
      false
    )
    expect(data).toBe('M0,0C0,10 10,10 10,0')
  })

  it('curves the segments either side of a point that has a handle, and closes onto it', () => {
    const data = getPenPathData(
      [
        { x: 0, y: 0, handleOut: { x: 5, y: -5 } },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ],
      true
    )
    expect(data).toBe('M0,0C5,-5 10,0 10,0L10,10C10,10 -5,5 0,0Z')
  })
})

describe('createPathDraftOperation', () => {
  it('creates a path node at the box of its points, with the outline relative to it', () => {
    const operation = createPathDraftOperation(
      draft([
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 60 }
      ]),
      { closed: true }
    )
    expect(operation.kind).toBe('create')
    if (operation.kind !== 'create') return
    expect(operation.type).toBe('path')
    expect(operation.properties).toMatchObject({ x: 10, y: 20, width: 20, height: 40 })
    expect(getPathArea(operation.properties?.pathData ?? '')).toBeCloseTo(400)
    expect(getPathBounds(operation.properties?.pathData ?? '').x).toBe(0)
  })

  it('fills a closed polygon and only strokes an open pen line', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ]
    const closed = createPathDraftOperation(draft(points), { closed: true })
    const open = createPathDraftOperation(draft(points, 'pen'), { closed: false })
    expect(closed.kind === 'create' && closed.properties?.fill).toBe('#d9d9d9')
    expect(open.kind === 'create' && open.properties?.fill).toBe(null)
    expect(open.kind === 'create' && open.properties?.stroke).toBe('#000000')
  })

  it('ends the outline at a point the pointer is still moving to', () => {
    const operation = createPathDraftOperation(draft([{ x: 0, y: 0 }]), {
      closed: false,
      pending: { x: 8, y: 6 }
    })
    expect(operation.kind === 'create' && operation.properties?.width).toBe(8)
  })
})

describe('isNearFirstPoint', () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 }
  ]

  it('is true within a few screen pixels of the start, at any zoom', () => {
    expect(isNearFirstPoint(triangle, { x: 1, y: 1 }, 1)).toBe(true)
    expect(isNearFirstPoint(triangle, { x: CLOSE_DISTANCE_PX, y: 0 }, 1)).toBe(true)
    expect(isNearFirstPoint(triangle, { x: CLOSE_DISTANCE_PX, y: 0 }, 4)).toBe(false)
  })

  it('needs three points, so a click on the only point does not close it', () => {
    expect(
      isNearFirstPoint(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 }
        ],
        { x: 0, y: 0 },
        1
      )
    ).toBe(false)
  })
})

describe('removeRepeatedPoints', () => {
  it('drops a point placed twice in a row, as a double click does', () => {
    expect(
      removeRepeatedPoints([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 9, y: 9 }
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 9, y: 9 }
    ])
  })

  it('keeps a point that returns to an earlier place', () => {
    expect(
      removeRepeatedPoints([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 0 }
      ])
    ).toHaveLength(3)
  })
})
