import { describe, expect, it } from 'vitest'
import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { getPathRasterPadding, pathRasterKey } from './pathRaster.ts'

const path: DesignNode = {
  ...DEFAULT_NODE_PROPERTIES,
  id: 'p',
  type: 'path',
  parentId: 'page',
  order: 0,
  width: 10,
  height: 10,
  pathData: 'M0,0L10,0L10,10Z'
}

describe('getPathRasterPadding', () => {
  it('leaves a pixel for the anti-aliased edge of a path with no stroke', () => {
    expect(getPathRasterPadding(path)).toBe(1)
  })

  it('adds half the stroke width, which reaches past the box', () => {
    expect(getPathRasterPadding({ ...path, stroke: '#000000', strokeWidth: 6 })).toBe(4)
  })
})

describe('pathRasterKey', () => {
  it('is the same for paths that draw the same pixels', () => {
    expect(pathRasterKey(path, 2)).toBe(pathRasterKey({ ...path, id: 'other', x: 50 }, 2))
  })

  it('changes with the outline, the paint and the zoom bucket', () => {
    const key = pathRasterKey(path, 2)
    expect(pathRasterKey({ ...path, pathData: 'M0,0L5,5Z' }, 2)).not.toBe(key)
    expect(pathRasterKey({ ...path, fill: '#ff0000' }, 2)).not.toBe(key)
    expect(pathRasterKey({ ...path, stroke: '#000000' }, 2)).not.toBe(key)
    expect(pathRasterKey(path, 4)).not.toBe(key)
  })
})
