import { describe, expect, it } from 'vitest'
import { combinePaths, getPathArea, getPathBounds } from './booleans.ts'

const square = 'M0,0 L10,0 L10,10 L0,10 Z'
const shiftedSquare = 'M5,5 L15,5 L15,15 L5,15 Z'

describe('combinePaths', () => {
  it('unites two overlapping squares into one outline', () => {
    const united = combinePaths('union', [square, shiftedSquare])
    expect(getPathArea(united)).toBeCloseTo(175)
    expect(getPathBounds(united)).toEqual({ x: 0, y: 0, width: 15, height: 15 })
  })

  it('subtracts every later path from the first', () => {
    const cut = combinePaths('subtract', [square, shiftedSquare])
    expect(getPathArea(cut)).toBeCloseTo(75)
    expect(getPathBounds(cut)).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('intersects to the shared region', () => {
    const shared = combinePaths('intersect', [square, shiftedSquare])
    expect(getPathArea(shared)).toBeCloseTo(25)
    expect(getPathBounds(shared)).toEqual({ x: 5, y: 5, width: 5, height: 5 })
  })

  it('excludes the shared region', () => {
    const outside = combinePaths('exclude', [square, shiftedSquare])
    expect(getPathArea(outside)).toBeCloseTo(150)
  })

  it('folds three paths from left to right', () => {
    const third = 'M0,0 L2,0 L2,2 L0,2 Z'
    const united = combinePaths('union', [square, shiftedSquare, third])
    expect(getPathArea(united)).toBeCloseTo(175)
  })

  it('returns the only path unchanged in area', () => {
    expect(getPathArea(combinePaths('union', [square]))).toBeCloseTo(100)
  })

  it('gives an empty path when an intersection is empty', () => {
    const far = 'M50,50 L60,50 L60,60 L50,60 Z'
    expect(getPathArea(combinePaths('intersect', [square, far]))).toBe(0)
  })

  it('throws on no paths', () => {
    expect(() => combinePaths('union', [])).toThrow()
  })
})
