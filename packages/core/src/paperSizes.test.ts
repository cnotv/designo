import { describe, expect, it } from 'vitest'
import { getPageSetupPatch, millimetresToPoints } from './pageSetup.ts'
import { findPaperSize, getPaperSizeSetup, PAPER_SIZES } from './paperSizes.ts'
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

  it('has no two sizes close enough to be taken for each other', () => {
    const everySizeFindsItself = PAPER_SIZES.every(
      (size) =>
        findPaperSize(millimetresToPoints(size.width), millimetresToPoints(size.height))?.id ===
        size.id
    )
    expect(everySizeFindsItself).toBe(true)
  })
})

describe('findPaperSize', () => {
  it('finds A4 from the points the document stores', () => {
    expect(findPaperSize(595.28, 841.89)?.id).toBe('a4')
  })

  it('finds A4 from a size typed by hand to two decimals', () => {
    expect(findPaperSize(595.3, 841.9)?.id).toBe('a4')
  })

  it('leaves a custom size without a match', () => {
    expect(findPaperSize(600, 800)).toBeUndefined()
  })

  it('does not match a landscape page', () => {
    expect(findPaperSize(841.89, 595.28)).toBeUndefined()
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
