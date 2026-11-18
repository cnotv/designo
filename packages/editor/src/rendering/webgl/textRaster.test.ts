import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { describe, expect, it } from 'vitest'
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

describe('measureTextRaster', () => {
  it('grows past the box for long lines and for every line', () => {
    expect(measureTextRaster(text, 120)).toEqual({ width: 122, height: 50 })
  })

  it('keeps at least the box', () => {
    expect(measureTextRaster({ ...text, text: 'a', width: 300, height: 80 }, 10)).toEqual({
      width: 300,
      height: 80
    })
  })
})

describe('measureTextRaster and the line height', () => {
  it('is as tall as its lines are spaced', () => {
    expect(measureTextRaster({ ...text, lineHeight: 2 }, 120).height).toBe(80)
  })
})

describe('textRasterKey', () => {
  it('shares a texture between identical text, and not across zoom buckets or colours', () => {
    expect(textRasterKey(text, 1)).toBe(textRasterKey({ ...text, id: 'other', x: 500 }, 1))
    expect(textRasterKey(text, 1)).not.toBe(textRasterKey(text, 2))
    expect(textRasterKey(text, 1)).not.toBe(textRasterKey({ ...text, fill: '#ff0000' }, 1))
  })
})
