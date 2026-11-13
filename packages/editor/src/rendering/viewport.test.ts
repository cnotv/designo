import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { fitViewportToContent, getContentBounds } from './viewport.ts'

const rectangleAt = (x: number, y: number, width: number, height: number): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: `rect-${x}-${y}`,
  type: 'rectangle',
  parentId: 'page',
  order: 0,
  x,
  y,
  width,
  height
})

describe('getContentBounds', () => {
  it('covers every node', () => {
    expect(getContentBounds([rectangleAt(10, 20, 100, 50), rectangleAt(-40, 0, 20, 300)])).toEqual({
      x: -40,
      y: 0,
      width: 150,
      height: 300
    })
  })

  it('has no bounds for no nodes', () => {
    expect(getContentBounds([])).toBeUndefined()
  })
})

describe('fitViewportToContent', () => {
  it('never zooms in past 100%', () => {
    const viewport = fitViewportToContent({ x: 0, y: 0, width: 10, height: 10 }, 800, 600, 40)
    expect(viewport).toEqual({ scale: 1, offsetX: 395, offsetY: 295 })
  })

  it('zooms out so large content fits inside the margin', () => {
    const viewport = fitViewportToContent({ x: 0, y: 0, width: 1440, height: 560 }, 800, 600, 40)
    expect(viewport.scale).toBeCloseTo(0.5)
  })
})
