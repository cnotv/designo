import { describe, expect, it } from 'vitest'
import {
  createDefaultGradient,
  keepAlpha,
  readBlendMode,
  withStopColor
} from './effectProperties.ts'

describe('createDefaultGradient', () => {
  it('starts on the fill the node has', () => {
    expect(createDefaultGradient({ fill: '#ff0000' }).stops[0]?.color).toBe('#ff0000')
  })

  it('starts on black for a node with no fill', () => {
    expect(createDefaultGradient({ fill: null }).stops[0]?.color).toBe('#000000')
  })
})

describe('readBlendMode', () => {
  it('knows the modes and nothing else', () => {
    expect(readBlendMode('multiply')).toBe('multiply')
    expect(readBlendMode('dissolve')).toBeUndefined()
  })
})

describe('withStopColor', () => {
  it('changes one stop only', () => {
    const gradient = createDefaultGradient({ fill: '#111111' })
    expect(withStopColor(gradient, 1, '#222222').stops.map((stop) => stop.color)).toEqual([
      '#111111',
      '#222222'
    ])
  })
})

describe('keepAlpha', () => {
  it('carries the old alpha onto the edited colour', () => {
    expect(keepAlpha('#00000040', '#ff0000')).toBe('#ff000040')
    expect(keepAlpha('#000000', '#ff0000')).toBe('#ff0000')
  })
})
