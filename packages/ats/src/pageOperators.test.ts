import { describe, expect, it } from 'vitest'
import { readPageOperators, type OperatorCodes } from './pageOperators.ts'

const CODES: OperatorCodes = {
  save: 1,
  restore: 2,
  transform: 3,
  paintFormXObjectBegin: 4,
  paintFormXObjectEnd: 5,
  setTextRenderingMode: 6,
  imageOperators: [7]
}
const read = (steps: [number, unknown][]) =>
  readPageOperators(
    { fnArray: steps.map(([code]) => code), argsArray: steps.map(([, args]) => args) },
    CODES,
    800
  )

describe('readPageOperators', () => {
  it('places a picture where the matrix scales and moves the unit square, from the top', () => {
    const { images } = read([
      [1, []],
      [3, [200, 0, 0, 100, 50, 600]],
      [7, ['img']],
      [2, []]
    ])
    expect(images).toEqual([{ x: 50, y: 100, width: 200, height: 100 }])
  })

  it('forgets a matrix after restore', () => {
    const { images } = read([
      [1, []],
      [3, [10, 0, 0, 10, 0, 0]],
      [2, []],
      [7, ['img']]
    ])
    expect(images[0]).toMatchObject({ width: 1, height: 1 })
  })

  it('applies the matrix of a form to the pictures inside it', () => {
    const { images } = read([
      [4, [[2, 0, 0, 2, 0, 0]]],
      [7, ['img']],
      [5, []]
    ])
    expect(images[0]).toMatchObject({ width: 2, height: 2 })
  })

  it('notes text drawn in the invisible render mode', () => {
    expect(read([[6, [3]]]).hasInvisibleText).toBe(true)
    expect(read([[6, [0]]]).hasInvisibleText).toBe(false)
  })
})
