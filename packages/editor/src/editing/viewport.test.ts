import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { fitViewportToContent, getContentBounds, keepCenterOnResize } from './viewport.ts'

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

describe('keepCenterOnResize', () => {
  it('keeps the middle of the canvas on the same world point when the canvas widens', () => {
    const before = { offsetX: 100, offsetY: 50, scale: 2 }
    const after = keepCenterOnResize(
      before,
      { width: 600, height: 400 },
      { width: 840, height: 400 }
    )
    expect((300 - before.offsetX) / before.scale).toBe((420 - after.offsetX) / after.scale)
    expect(after.offsetY).toBe(before.offsetY)
  })
})
