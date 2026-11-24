import { describe, expect, it } from 'vitest'
import { getPageSetupPatch, millimetresToPoints } from './pageSetup.ts'
import { getPaperSizeSetup, PAPER_SIZES } from './paperSizes.ts'
import { DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import type { DesignNode } from './types.ts'

describe('PAPER_SIZES', () => {
  it('has a unique id for every size', () => {
    const ids = PAPER_SIZES.map((size) => size.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a positive width and height for every size', () => {
    expect(PAPER_SIZES.every((size) => size.width > 0 && size.height > 0)).toBe(true)
  })

  it('lists every group', () => {
    expect(new Set(PAPER_SIZES.map((size) => size.group))).toEqual(
      new Set(['iso', 'us', 'envelope', 'card'])
    )
  })

  it('has A4 at 210 by 297 millimetres', () => {
    expect(PAPER_SIZES.find((size) => size.id === 'a4')).toMatchObject({
      name: 'A4',
      width: 210,
      height: 297
    })
  })

  it('puts A4 at 595.28 by 841.89 points, the size the document stores', () => {
    expect(millimetresToPoints(210)).toBeCloseTo(595.28, 2)
    expect(millimetresToPoints(297)).toBeCloseTo(841.89, 2)
  })
})

describe('getPaperSizeSetup', () => {
  const frame = (): DesignNode => ({
    ...DEFAULT_NODE_PROPERTIES,
    id: 'frame-1',
    type: 'frame',
    parentId: 'page-1',
    order: 0,
    pageUnit: 'pt'
  })

  it('states a size in millimetres', () => {
    const a4 = PAPER_SIZES.find((size) => size.id === 'a4')
    expect(a4 && getPaperSizeSetup(a4)).toEqual({ unit: 'mm', width: 210, height: 297 })
  })

  it('turns into a patch that stores points and switches the unit', () => {
    const a4 = PAPER_SIZES.find((size) => size.id === 'a4')
    expect(a4 && getPageSetupPatch(frame(), getPaperSizeSetup(a4))).toEqual({
      pageUnit: 'mm',
      width: expect.closeTo(595.28, 2),
      height: expect.closeTo(841.89, 2)
    })
  })
})
