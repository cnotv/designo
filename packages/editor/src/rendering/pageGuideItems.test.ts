import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { getPageGuideItems } from './pageGuideItems.ts'
import type { SceneItem } from './types.ts'

const frameItem = (properties: Partial<DesignNode>): SceneItem => ({
  node: {
    ...DEFAULT_NODE_PROPERTIES,
    id: 'frame-1',
    type: 'frame',
    parentId: 'page-1',
    order: 0,
    x: 100,
    y: 50,
    width: 200,
    height: 100,
    ...properties
  },
  clipFrames: []
})

const guides = {
  margins: { top: 10, bottom: 10, inner: 20, outer: 10 },
  columns: 2,
  gutter: 10,
  fold: true
}

describe('getPageGuideItems', () => {
  it('draws nothing for a frame without bleed or guides, and for anything but a frame', () => {
    expect(getPageGuideItems(frameItem({}), 1)).toEqual([])
    expect(getPageGuideItems(frameItem({ type: 'rectangle', bleed: 5, guides }), 1)).toEqual([])
  })

  it('draws the bleed outside the frame, as a hairline at any zoom', () => {
    const [bleed] = getPageGuideItems(frameItem({ bleed: 8 }), 4)
    expect(bleed?.node).toMatchObject({
      type: 'rectangle',
      fill: null,
      x: 92,
      y: 42,
      width: 216,
      height: 116,
      strokeWidth: 0.25
    })
  })

  it('draws the margins, the columns and the fold in the frame position', () => {
    const items = getPageGuideItems(frameItem({ guides }), 1)
    expect(items.map(({ node }) => node.id)).toEqual([
      'frame-1:guide:margin:0',
      'frame-1:guide:column:0',
      'frame-1:guide:column:1',
      'frame-1:guide:fold'
    ])
    expect(items[0]?.node).toMatchObject({ x: 120, y: 60, width: 170, height: 80 })
    expect(items[3]?.node).toMatchObject({ x: 200, y: 50, height: 100 })
  })

  it('is clipped by the frames that clip the frame, not by the frame itself', () => {
    const clip = frameItem({ id: 'outer' }).node
    const [bleed] = getPageGuideItems({ ...frameItem({ bleed: 8 }), clipFrames: [clip] }, 1)
    expect(bleed?.clipFrames).toEqual([clip])
  })

  it('draws nothing for a turned frame, which the guides do not follow', () => {
    expect(getPageGuideItems(frameItem({ bleed: 8, rotation: 10 }), 1)).toEqual([])
  })
})
