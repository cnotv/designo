import { describe, expect, it } from 'vitest'
import { getPathArea, getPathBounds } from './booleans.ts'
import { applyOperations, createDocument } from './document.ts'
import { DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import {
  getBooleanResult,
  getPathBox,
  getWorldOutline,
  withPathScaledToSize
} from './pathOutline.ts'
import type { DesignNode } from './types.ts'

const makeNode = (overrides: Partial<DesignNode>): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: 'n',
  type: 'rectangle',
  parentId: 'page',
  order: 0,
  ...overrides
})

const rectangle = makeNode({ x: 0, y: 0, width: 10, height: 10 })
const ellipse = makeNode({ id: 'e', type: 'ellipse', x: 5, y: 5, width: 10, height: 10 })

describe('getWorldOutline', () => {
  it('traces a rectangle at its place', () => {
    const outline = getWorldOutline(makeNode({ x: 4, y: 6, width: 10, height: 20 }))
    expect(getPathBounds(outline)).toEqual({ x: 4, y: 6, width: 10, height: 20 })
    expect(getPathArea(outline)).toBeCloseTo(200)
  })

  it('rounds the corners of a rectangle', () => {
    const outline = getWorldOutline(makeNode({ width: 10, height: 10, cornerRadius: 5 }))
    expect(getPathArea(outline)).toBeCloseTo(Math.PI * 25, 0)
  })

  it('traces an ellipse inside its box', () => {
    const outline = getWorldOutline(ellipse)
    expect(getPathArea(outline)).toBeCloseTo(Math.PI * 25, 0)
    expect(getPathBounds(outline).x).toBeCloseTo(5)
  })

  it('offsets a path node by its position', () => {
    const outline = getWorldOutline(
      makeNode({ type: 'path', x: 10, y: 10, pathData: 'M0,0 L4,0 L4,4 L0,4 Z' })
    )
    expect(getPathBounds(outline)).toEqual({ x: 10, y: 10, width: 4, height: 4 })
  })

  it('turns a rectangle about its centre', () => {
    const turned = getWorldOutline(makeNode({ width: 10, height: 10, rotation: 45 }))
    expect(getPathBounds(turned).width).toBeCloseTo(Math.SQRT2 * 10)
    expect(getPathBounds(turned).x).toBeCloseTo(5 - (Math.SQRT2 * 10) / 2)
  })
})

describe('getBooleanResult', () => {
  it('makes a path node box from the combined outline', () => {
    const result = getBooleanResult('union', [rectangle, ellipse])
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
    expect(result.width).toBeCloseTo(15)
    expect(result.height).toBeCloseTo(15)
    expect(getPathBounds(result.pathData).x).toBeCloseTo(0)
  })

  it('keeps the path in the new box, so it starts at the origin', () => {
    const far = makeNode({ x: 100, y: 200, width: 10, height: 10 })
    const result = getBooleanResult('subtract', [
      far,
      makeNode({ x: 100, y: 200, width: 5, height: 5 })
    ])
    expect(result.x).toBeCloseTo(100)
    expect(result.y).toBeCloseTo(200)
    expect(getPathBounds(result.pathData).x).toBeCloseTo(0)
    expect(getPathBounds(result.pathData).y).toBeCloseTo(0)
    expect(getPathArea(result.pathData)).toBeCloseTo(75)
  })

  it('subtracts the later nodes from the first', () => {
    const result = getBooleanResult('subtract', [rectangle, ellipse])
    expect(result.width).toBeCloseTo(10)
    expect(getPathArea(result.pathData)).toBeLessThan(100)
  })

  it('refuses fewer than two nodes', () => {
    expect(() => getBooleanResult('union', [rectangle])).toThrow()
  })

  it('refuses a node that has no outline', () => {
    expect(() => getBooleanResult('union', [rectangle, makeNode({ type: 'text' })])).toThrow()
  })
})

describe('getPathBox', () => {
  it('moves an outline to the origin and reports where it was', () => {
    const box = getPathBox('M10,20 L30,20 L30,60 L10,60 Z')
    expect([box.x, box.y, box.width, box.height]).toEqual([10, 20, 20, 40])
    expect(getPathBounds(box.pathData)).toEqual({ x: 0, y: 0, width: 20, height: 40 })
  })

  it('covers the whole of a curve, not only its points', () => {
    const box = getPathBox('M0,0 C0,10 10,10 10,0')
    expect(box.height).toBeCloseTo(7.5)
  })

  it('keeps a straight line as a box with no height', () => {
    const box = getPathBox('M0,5 L10,5')
    expect([box.width, box.height]).toEqual([10, 0])
  })
})

describe('withPathScaledToSize', () => {
  const triangle = makeNode({
    type: 'path',
    width: 10,
    height: 10,
    pathData: 'M0,10L5,0L10,10Z'
  })

  it('stretches the outline by the share the size changes', () => {
    const patch = withPathScaledToSize(triangle, { width: 20, height: 5 })
    expect(getPathBounds(patch.pathData ?? '')).toEqual({ x: 0, y: 0, width: 20, height: 5 })
  })

  it('stretches along one axis when only one changes', () => {
    const patch = withPathScaledToSize(triangle, { height: 30 })
    expect(getPathBounds(patch.pathData ?? '')).toEqual({ x: 0, y: 0, width: 10, height: 30 })
  })

  it('leaves a move, other properties, and an outline set in the same patch alone', () => {
    expect(withPathScaledToSize(triangle, { x: 5, fill: '#000000' })).toEqual({
      x: 5,
      fill: '#000000'
    })
    const own = { width: 20, pathData: 'M0,0L1,1' }
    expect(withPathScaledToSize(triangle, own)).toBe(own)
  })

  it('does not stretch a rectangle, or from or to a size of zero', () => {
    const resized = { width: 20 }
    expect(withPathScaledToSize(rectangle, resized)).toBe(resized)
    const fromZero = { height: 10 }
    expect(withPathScaledToSize({ ...triangle, height: 0 }, fromZero)).toBe(fromZero)
    expect(withPathScaledToSize(triangle, { width: 0 }).pathData).toBeUndefined()
  })
})

describe('resizing a path through an update', () => {
  it('stretches the outline with the box, and back again on undo', () => {
    const start = applyOperations(createDocument('file', 'File', 'page'), [
      {
        kind: 'create',
        id: 'p',
        type: 'path',
        parentId: 'page',
        properties: { width: 10, height: 10, pathData: 'M0,0L10,0L10,10Z' }
      }
    ])
    if (!start.ok) throw new Error(start.error)
    const wider = applyOperations(start.document, [
      { kind: 'update', id: 'p', patch: { width: 40 } }
    ])
    if (!wider.ok) throw new Error(wider.error)
    expect(getPathBounds(wider.document.nodes['p']?.pathData ?? '').width).toBe(40)
    const back = applyOperations(wider.document, [
      { kind: 'update', id: 'p', patch: { width: 10 } }
    ])
    if (!back.ok) throw new Error(back.error)
    expect(getPathBounds(back.document.nodes['p']?.pathData ?? '').width).toBeCloseTo(10)
  })
})
