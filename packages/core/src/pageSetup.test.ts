import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import {
  fromPoints,
  getPageGuideGeometry,
  getPageSetupPatch,
  millimetresToPoints,
  pointsToMillimetres,
  toPoints
} from './pageSetup.ts'
import type { DesignNode, PageGuides } from './types.ts'

const frame = (properties: Partial<DesignNode>): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: 'frame-1',
  type: 'frame',
  parentId: 'page-1',
  order: 0,
  width: 200,
  height: 100,
  ...properties
})

const guides = (overrides: Partial<PageGuides>): PageGuides => ({
  margins: { top: 10, bottom: 20, inner: 30, outer: 5 },
  columns: 1,
  gutter: 0,
  fold: false,
  ...overrides
})

describe('units', () => {
  it('converts millimetres to points: A4 is 595.28 by 841.89', () => {
    expect(millimetresToPoints(210)).toBeCloseTo(595.28, 2)
    expect(millimetresToPoints(297)).toBeCloseTo(841.89, 2)
  })

  it('round trips', () => {
    expect(pointsToMillimetres(millimetresToPoints(3))).toBeCloseTo(3, 10)
  })

  it('reads and writes points unchanged', () => {
    expect(toPoints(12, 'pt')).toBe(12)
    expect(fromPoints(12, 'pt')).toBe(12)
    expect(toPoints(3, 'mm')).toBeCloseTo(8.504, 3)
    expect(fromPoints(8.504, 'mm')).toBeCloseTo(3, 2)
  })
})

describe('getPageGuideGeometry', () => {
  it('has no bleed, margins, columns or fold by default', () => {
    expect(getPageGuideGeometry(frame({}))).toEqual({
      trim: { x: 0, y: 0, width: 200, height: 100 },
      bleed: undefined,
      margins: [],
      columns: [],
      fold: undefined
    })
  })

  it('grows the bleed past the trim on every side', () => {
    expect(getPageGuideGeometry(frame({ bleed: 8 })).bleed).toEqual({
      x: -8,
      y: -8,
      width: 216,
      height: 116
    })
  })

  it('puts the inner margin on the left of a single page and of a right page', () => {
    const expected = [{ x: 30, y: 10, width: 165, height: 70 }]
    expect(getPageGuideGeometry(frame({ guides: guides({}) })).margins).toEqual(expected)
    expect(getPageGuideGeometry(frame({ facing: 'right', guides: guides({}) })).margins).toEqual(
      expected
    )
  })

  it('puts the inner margin on the right of a left page', () => {
    expect(getPageGuideGeometry(frame({ facing: 'left', guides: guides({}) })).margins).toEqual([
      { x: 5, y: 10, width: 165, height: 70 }
    ])
  })

  it('mirrors the margins across the two pages of a spread', () => {
    expect(getPageGuideGeometry(frame({ facing: 'spread', guides: guides({}) })).margins).toEqual([
      { x: 5, y: 10, width: 65, height: 70 },
      { x: 130, y: 10, width: 65, height: 70 }
    ])
  })

  it('splits the margin box into columns with a gutter between them', () => {
    const { columns } = getPageGuideGeometry(frame({ guides: guides({ columns: 3, gutter: 5 }) }))
    expect(columns.map((column) => column.x)).toEqual([
      expect.closeTo(30),
      expect.closeTo(86.667),
      expect.closeTo(143.333)
    ])
    expect(columns.map((column) => column.width)).toEqual([
      expect.closeTo(51.667),
      expect.closeTo(51.667),
      expect.closeTo(51.667)
    ])
  })

  it('draws no columns for one column', () => {
    expect(getPageGuideGeometry(frame({ guides: guides({ columns: 1 }) })).columns).toEqual([])
  })

  it('puts the fold in the middle when asked', () => {
    expect(getPageGuideGeometry(frame({ guides: guides({ fold: true }) })).fold).toBe(100)
  })
})

describe('getPageSetupPatch', () => {
  it('turns a size in millimetres into points and remembers the unit', () => {
    const patch = getPageSetupPatch(frame({}), { unit: 'mm', width: 210, height: 297, bleed: 3 })
    expect(patch.pageUnit).toBe('mm')
    expect(patch.width).toBeCloseTo(595.28, 2)
    expect(patch.height).toBeCloseTo(841.89, 2)
    expect(patch.bleed).toBeCloseTo(8.504, 3)
  })

  it('keeps the frame unit and leaves out what was not given', () => {
    expect(getPageSetupPatch(frame({ pageUnit: 'mm' }), { width: 100 }).width).toBeCloseTo(
      283.46,
      2
    )
    expect(getPageSetupPatch(frame({}), { facing: 'spread' })).toEqual({ facing: 'spread' })
  })

  it('merges guide fields into the guides the frame has, or into empty ones', () => {
    expect(getPageSetupPatch(frame({}), { unit: 'pt', columns: 2, gutter: 4 }).guides).toEqual({
      margins: { top: 0, bottom: 0, inner: 0, outer: 0 },
      columns: 2,
      gutter: 4,
      fold: false
    })
    expect(
      getPageSetupPatch(frame({ guides: guides({}) }), { margins: { inner: 12 } }).guides
    ).toEqual(guides({ margins: { top: 10, bottom: 20, inner: 12, outer: 5 } }))
  })

  it('removes the guides when given null', () => {
    expect(getPageSetupPatch(frame({ guides: guides({}) }), { guides: null })).toEqual({
      guides: null
    })
  })
})
