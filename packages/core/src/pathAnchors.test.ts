import { describe, expect, it } from 'vitest'
import { getPathBounds } from './booleans.ts'
import {
  getPathContours,
  insertPathAnchor,
  smoothPathAnchor,
  writePathContours
} from './pathAnchors.ts'

const triangle = 'M0,0L10,0L10,10Z'

describe('getPathContours', () => {
  it('reads corner points as anchors with no handles', () => {
    const [contour] = getPathContours(triangle)
    expect(contour?.closed).toBe(true)
    expect(contour?.anchors).toEqual([
      { x: 0, y: 0, handleIn: null, handleOut: null },
      { x: 10, y: 0, handleIn: null, handleOut: null },
      { x: 10, y: 10, handleIn: null, handleOut: null }
    ])
  })

  it('reads curve control points as handles relative to their anchor', () => {
    const [contour] = getPathContours('M0,0C0,10 10,10 10,0')
    expect(contour?.closed).toBe(false)
    expect(contour?.anchors[0]).toMatchObject({ handleIn: null, handleOut: { x: 0, y: 10 } })
    expect(contour?.anchors[1]).toMatchObject({ x: 10, y: 0, handleIn: { x: 0, y: 10 } })
  })

  it('reads every contour of a path with holes', () => {
    expect(getPathContours('M0,0L10,0L10,10ZM2,2L4,2L4,4Z')).toHaveLength(2)
  })

  it('gives no contours for empty path data', () => {
    expect(getPathContours('')).toEqual([])
  })
})

describe('writePathContours', () => {
  it('writes back what was read, with the same outline', () => {
    const curve = 'M0,0C0,10 10,10 10,0L10,-5Z'
    const again = writePathContours(getPathContours(curve))
    expect(getPathBounds(again)).toEqual(getPathBounds(curve))
    expect(getPathContours(again)).toEqual(getPathContours(curve))
  })

  it('moves an anchor and the outline follows', () => {
    const [contour] = getPathContours(triangle)
    if (!contour) throw new Error('no contour')
    const moved = writePathContours([
      { ...contour, anchors: contour.anchors.map((a, i) => (i === 2 ? { ...a, y: 30 } : a)) }
    ])
    expect(getPathBounds(moved).height).toBe(30)
  })
})

describe('insertPathAnchor', () => {
  it('adds an anchor on the segment nearest the point, snapped onto the outline', () => {
    const result = insertPathAnchor(triangle, { x: 5, y: 0.5 }, 2)
    expect(result?.pathData).toBeDefined()
    expect(result?.contour).toBe(0)
    expect(result?.index).toBe(1)
    const [contour] = getPathContours(result?.pathData ?? '')
    expect(contour?.anchors).toHaveLength(4)
    expect(contour?.anchors[1]).toMatchObject({ x: 5, y: 0 })
  })

  it('does nothing when the point is farther than the tolerance from the outline', () => {
    expect(insertPathAnchor(triangle, { x: 5, y: 8 }, 2)).toBeUndefined()
  })
})

describe('smoothPathAnchor', () => {
  it('gives a corner point handles along the line between its neighbours', () => {
    const smoothed = smoothPathAnchor(getPathContours('M0,0L10,10L20,0'), 0, 1)
    const anchor = smoothed[0]?.anchors[1]
    expect(anchor?.handleIn).not.toBeNull()
    expect(anchor?.handleOut).not.toBeNull()
    expect((anchor?.handleIn?.x ?? 0) + (anchor?.handleOut?.x ?? 0)).toBeCloseTo(0)
  })
})
