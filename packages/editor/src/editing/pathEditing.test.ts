import {
  DEFAULT_NODE_PROPERTIES,
  applyOperations,
  createDocument,
  getPathContours,
  type DesignDocument,
  type DesignNode
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  createAddAnchorOperations,
  createBakeRotationOperations,
  createMoveTargetOperations,
  createRemoveAnchorOperations,
  createRemoveHandleOperations,
  createToggleAnchorOperations,
  findPathEditTarget,
  getPathEditHandles
} from './pathEditing.ts'

const makePath = (overrides: Partial<DesignNode> = {}): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: 'p',
  type: 'path',
  parentId: 'page',
  order: 0,
  x: 100,
  y: 50,
  width: 10,
  height: 10,
  pathData: 'M0,0L10,0L10,10Z',
  ...overrides
})

const apply = (node: DesignNode, operations: ReturnType<typeof createMoveTargetOperations>) => {
  const start = applyOperations(createDocument('f', 'F', 'page'), [
    { kind: 'create', id: node.id, type: 'path', parentId: 'page', properties: node }
  ])
  if (!start.ok) throw new Error(start.error)
  const next = applyOperations(start.document, operations)
  if (!next.ok) throw new Error(next.error)
  return (next.document as DesignDocument).nodes[node.id]
}

describe('getPathEditHandles', () => {
  it('lists every anchor in world units', () => {
    const handles = getPathEditHandles(makePath(), undefined)
    expect(handles.map((handle) => handle.point)).toEqual([
      { x: 100, y: 50 },
      { x: 110, y: 50 },
      { x: 110, y: 60 }
    ])
  })

  it('adds the handles of the selected anchor only', () => {
    const node = makePath({ pathData: 'M0,0C0,10 10,10 10,0' })
    expect(getPathEditHandles(node, undefined)).toHaveLength(2)
    const handles = getPathEditHandles(node, { contour: 0, index: 0 })
    expect(handles.find((handle) => handle.part === 'handleOut')?.point).toEqual({
      x: 100,
      y: 60
    })
    expect(handles).toHaveLength(3)
  })
})

describe('findPathEditTarget', () => {
  const handles = getPathEditHandles(makePath(), undefined)

  it('finds the anchor within a few screen pixels, at any zoom', () => {
    expect(findPathEditTarget(handles, { x: 110.5, y: 50 }, 1)).toMatchObject({ index: 1 })
    expect(findPathEditTarget(handles, { x: 110.5, y: 50 }, 100)).toBeUndefined()
  })

  it('prefers a handle over the anchor it sits on', () => {
    const [anchor] = getPathEditHandles(makePath({ pathData: 'M0,0L10,0' }), undefined)
    const both = [
      ...(anchor ? [anchor] : []),
      { contour: 0, index: 0, part: 'handleOut' as const, point: { x: 100, y: 50 } }
    ]
    expect(findPathEditTarget(both, { x: 100, y: 50 }, 1)?.part).toBe('handleOut')
  })
})

describe('createMoveTargetOperations', () => {
  it('moves an anchor, and the box follows the outline', () => {
    const node = makePath()
    const moved = apply(
      node,
      createMoveTargetOperations(node, { contour: 0, index: 2, part: 'anchor' }, { x: 110, y: 90 })
    )
    expect([moved?.x, moved?.y, moved?.width, moved?.height]).toEqual([100, 50, 10, 40])
  })

  it('keeps the outline in place when an anchor moves up and left of the box', () => {
    const node = makePath()
    const moved = apply(
      node,
      createMoveTargetOperations(node, { contour: 0, index: 0, part: 'anchor' }, { x: 90, y: 40 })
    )
    expect([moved?.x, moved?.y]).toEqual([90, 40])
    const [contour] = getPathContours(moved?.pathData ?? '')
    expect(contour?.anchors[1]).toMatchObject({ x: 20, y: 10 })
  })

  it('drags a handle and keeps the opposite one on the same line through the anchor', () => {
    const node = makePath({ pathData: 'M0,0L10,0L20,0' })
    const smooth = apply(node, createToggleAnchorOperations(node, { contour: 0, index: 1 }))
    if (!smooth) throw new Error('no node')
    const moved = apply(
      smooth,
      createMoveTargetOperations(
        smooth,
        { contour: 0, index: 1, part: 'handleOut' },
        { x: smooth.x + 14, y: smooth.y + 6 }
      )
    )
    const anchor = getPathContours(moved?.pathData ?? '')[0]?.anchors[1]
    const out = anchor?.handleOut ?? { x: 0, y: 0 }
    const into = anchor?.handleIn ?? { x: 0, y: 0 }
    expect(out.x * into.y - out.y * into.x).toBeCloseTo(0)
    expect(out.x * into.x + out.y * into.y).toBeLessThan(0)
  })
})

describe('createRemoveAnchorOperations', () => {
  it('removes one anchor of a triangle, leaving a line', () => {
    const node = makePath()
    const next = apply(node, createRemoveAnchorOperations(node, { contour: 0, index: 1 }))
    expect(getPathContours(next?.pathData ?? '')[0]?.anchors).toHaveLength(2)
  })

  it('deletes the node when fewer than two anchors would remain', () => {
    const node = makePath({ pathData: 'M0,0L10,10' })
    expect(createRemoveAnchorOperations(node, { contour: 0, index: 0 })).toEqual([
      { kind: 'delete', id: 'p' }
    ])
  })
})

describe('createAddAnchorOperations', () => {
  it('adds an anchor on the outline where it was clicked', () => {
    const node = makePath()
    const result = createAddAnchorOperations(node, { x: 105, y: 50.5 }, 2)
    expect(result?.target).toEqual({ contour: 0, index: 1 })
    const next = apply(node, result?.operations ?? [])
    expect(getPathContours(next?.pathData ?? '')[0]?.anchors).toHaveLength(4)
  })

  it('does nothing away from the outline', () => {
    expect(createAddAnchorOperations(makePath(), { x: 105, y: 58 }, 2)).toBeUndefined()
  })
})

describe('createToggleAnchorOperations', () => {
  it('turns a corner into a smooth point and a smooth point back into a corner', () => {
    const node = makePath({ pathData: 'M0,0L10,10L20,0' })
    const smooth = apply(node, createToggleAnchorOperations(node, { contour: 0, index: 1 }))
    expect(getPathContours(smooth?.pathData ?? '')[0]?.anchors[1]?.handleOut).not.toBeNull()
    if (!smooth) throw new Error('no node')
    const corner = apply(smooth, createToggleAnchorOperations(smooth, { contour: 0, index: 1 }))
    expect(getPathContours(corner?.pathData ?? '')[0]?.anchors[1]?.handleOut).toBeNull()
  })
})

describe('createBakeRotationOperations', () => {
  it('turns the outline into the page and sets the rotation to zero', () => {
    const node = makePath({ width: 10, height: 10, rotation: 90, pathData: 'M0,0L10,0L10,10Z' })
    const baked = apply(node, createBakeRotationOperations(node))
    expect(baked?.rotation).toBe(0)
    expect(baked?.width).toBeCloseTo(10)
  })

  it('has nothing to do for a path that is not turned', () => {
    expect(createBakeRotationOperations(makePath())).toEqual([])
  })
})

describe('createRemoveHandleOperations', () => {
  const curved = makePath({ pathData: 'M0,0C0,10 10,10 10,0' })

  it('removes the one handle and keeps the other anchor and handle', () => {
    const next = apply(
      curved,
      createRemoveHandleOperations(curved, { contour: 0, index: 0, part: 'handleOut' })
    )
    const [first, second] = getPathContours(next?.pathData ?? '')[0]?.anchors ?? []
    expect(first?.handleOut).toBeNull()
    expect(second?.handleIn).not.toBeNull()
  })

  it('turns the segment straight when both of its handles are removed', () => {
    const half = apply(
      curved,
      createRemoveHandleOperations(curved, { contour: 0, index: 0, part: 'handleOut' })
    )
    if (!half) throw new Error('no node')
    const straight = apply(
      half,
      createRemoveHandleOperations(half, { contour: 0, index: 1, part: 'handleIn' })
    )
    expect(straight?.pathData).not.toContain('c')
    expect(straight?.height).toBe(0)
  })

  it('has nothing to remove from an anchor', () => {
    expect(createRemoveHandleOperations(curved, { contour: 0, index: 0, part: 'anchor' })).toEqual(
      []
    )
  })
})
