import { describe, expect, it } from 'vitest'
import { RAMP_WIDTH, bakeGradientRamp } from './gradientRamp.ts'

const pixel = (ramp: Uint8Array, index: number): number[] => [
  ...ramp.slice(index * 4, index * 4 + 4)
]

describe('bakeGradientRamp', () => {
  const ramp = bakeGradientRamp({
    kind: 'linear',
    angle: 0,
    stops: [
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff80' }
    ]
  })

  it('holds one pixel of four bytes per step', () => {
    expect(ramp).toHaveLength(RAMP_WIDTH * 4)
  })

  it('starts on the first stop and ends on the last', () => {
    expect(pixel(ramp, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(ramp, RAMP_WIDTH - 1)).toEqual([0, 0, 255, 128])
  })

  it('mixes the channels, alpha included, between the stops', () => {
    expect(pixel(ramp, 128)[0]).toBeCloseTo(127, -1)
    expect(pixel(ramp, 128)[3]).toBeCloseTo(191, -1)
  })

  it('holds the end colours past stops that do not reach 0 or 1', () => {
    const inset = bakeGradientRamp({
      kind: 'radial',
      angle: 0,
      stops: [
        { offset: 0.5, color: '#00ff00' },
        { offset: 0.6, color: '#ffffff' }
      ]
    })
    expect(pixel(inset, 0)).toEqual([0, 255, 0, 255])
    expect(pixel(inset, RAMP_WIDTH - 1)).toEqual([255, 255, 255, 255])
  })
})
