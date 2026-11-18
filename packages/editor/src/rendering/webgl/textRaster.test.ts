import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { describe, expect, it } from 'vitest'
import type { FallbackTextLayout } from '../text/types.ts'
import {
  bucketRasterScale,
  capRasterScale,
  measureTextRaster,
  textRasterKey
} from './textRaster.ts'

const text: DesignNode = {
  ...DEFAULT_NODE_PROPERTIES,
  id: 'label',
  type: 'text',
  parentId: 'page',
  order: 0,
  text: 'One\nTwo',
  fontSize: 20,
  lineHeight: 1.25,
  width: 50,
  height: 10
}

describe('bucketRasterScale', () => {
  it('rounds up to the next power of two, within 1/8 and 16', () => {
    expect([1, 1.5, 3, 0.3, 0.01, 100].map(bucketRasterScale)).toEqual([1, 2, 4, 0.5, 0.125, 16])
  })
})

describe('capRasterScale', () => {
  it('keeps the texture within 4096 pixels a side', () => {
    expect(capRasterScale(16, { width: 2000, height: 20 })).toBe(2.048)
    expect(capRasterScale(2, { width: 100, height: 20 })).toBe(2)
  })
})

const layout = (
  lineExtents: [number, number][],
  height: number,
  width = 0
): FallbackTextLayout => ({
  lines: lineExtents.map(([x, lineWidth]) => ({ text: 'x', x, width: lineWidth, baselineY: 0 })),
  width,
  height
})

describe('measureTextRaster', () => {
  it('covers the box and every line to its far edge, with room for overhang, and as tall as the lines', () => {
    expect(measureTextRaster(layout([[0, 120]], 50, 100))).toEqual({ width: 122, height: 50 })
  })

  it('covers a line that an alignment pushed past the box', () => {
    expect(measureTextRaster(layout([[90, 40]], 24, 100)).width).toBe(132)
  })

  it('is as tall as the layout says, which is how its lines are spaced', () => {
    expect(measureTextRaster(layout([[0, 10]], 80)).height).toBe(80)
  })
})

describe('textRasterKey', () => {
  it('shares a texture between identical text, and not across zoom buckets or colours', () => {
    expect(textRasterKey(text, 1)).toBe(textRasterKey({ ...text, id: 'other', x: 500 }, 1))
    expect(textRasterKey(text, 1)).not.toBe(textRasterKey(text, 2))
    expect(textRasterKey(text, 1)).not.toBe(textRasterKey({ ...text, fill: '#ff0000' }, 1))
  })

  it('tells apart what changes the lines: alignment, line height, wrapping and the width it wraps at', () => {
    const key = (patch: Partial<DesignNode>) => textRasterKey({ ...text, ...patch }, 1)
    expect(key({ textAlign: 'right' })).not.toBe(key({}))
    expect(key({ lineHeight: 2 })).not.toBe(key({}))
    expect(key({ textWrap: true })).not.toBe(key({}))
    expect(key({ textWrap: true, width: 80 })).not.toBe(key({ textWrap: true, width: 90 }))
  })

  it('ignores the width of a node that does not wrap, which its words set', () => {
    expect(textRasterKey({ ...text, width: 80 }, 1)).toBe(textRasterKey({ ...text, width: 90 }, 1))
  })
})
