import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import { getEffectReach, getFillGradient, getGradientLine } from './effects.ts'
import type { DesignNode, Gradient } from './types.ts'

const box = (patch: Partial<DesignNode> = {}): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: 'n',
  type: 'rectangle',
  parentId: 'p',
  order: 0,
  width: 200,
  height: 100,
  ...patch
})

const stops = [
  { offset: 0, color: '#000000' },
  { offset: 1, color: '#ffffff' }
]

describe('getEffectReach', () => {
  it('is zero for a node with no effects', () => {
    expect(getEffectReach(box())).toBe(0)
  })

  it('reaches three deviations out for a blur', () => {
    expect(getEffectReach(box({ blur: 10 }))).toBe(30)
  })

  it('adds a shadow offset to its blur', () => {
    const shadow = { x: 30, y: 40, blur: 2, color: '#000000' }
    expect(getEffectReach(box({ shadow }))).toBe(56)
  })
})

describe('getGradientLine', () => {
  it('runs left to right across the width at angle 0', () => {
    const gradient: Gradient = { kind: 'linear', angle: 0, stops }
    expect(getGradientLine(box(), gradient)).toEqual({
      startX: 0,
      startY: 50,
      endX: 200,
      endY: 50
    })
  })

  it('runs top to bottom across the height at angle 90', () => {
    const line = getGradientLine(box(), { kind: 'linear', angle: 90, stops })
    expect(line.startX).toBeCloseTo(100)
    expect(line.startY).toBeCloseTo(0)
    expect(line.endY).toBeCloseTo(100)
  })

  it('touches opposite corners at 45 degrees on a square', () => {
    const line = getGradientLine(box({ width: 100 }), { kind: 'linear', angle: 45, stops })
    expect(line.startX).toBeCloseTo(0)
    expect(line.endY).toBeCloseTo(100)
  })
})

describe('getFillGradient', () => {
  it('is the gradient of a shape and nothing for text', () => {
    const gradient: Gradient = { kind: 'radial', angle: 0, stops }
    expect(getFillGradient(box({ gradient }))).toBe(gradient)
    expect(getFillGradient(box({ gradient, type: 'text' }))).toBeUndefined()
  })
})
