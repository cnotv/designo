import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { createResizeOperations, createRotateOperations } from './operations.ts'
import {
  computeRotation,
  getRotatedCorners,
  getRotatedHandlePositions,
  normalizeRotation,
  resizeRotatedBounds,
  rotatedBoundsContainPoint,
  rotatePoint
} from './rotation.ts'
import { findContainerAtPoint, findNodeAtPoint, getClippingFrames } from './selection.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const origin = { x: 0, y: 0 }

describe('rotation maths', () => {
  it('rotates a point clockwise on screen', () => {
    const rotated = rotatePoint({ x: 10, y: 0 }, origin, 90)
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(10)
  })

  it('normalises angles into half open range around zero', () => {
    expect(normalizeRotation(190)).toBe(-170)
    expect(normalizeRotation(-190)).toBe(170)
    expect(normalizeRotation(180)).toBe(-180)
    expect(normalizeRotation(720)).toBe(0)
  })

  it('adds the angle swept around the centre to the starting rotation', () => {
    const rotation = computeRotation({
      center: origin,
      startPoint: { x: 10, y: 0 },
      currentPoint: { x: 0, y: 10 },
      startRotation: 10,
      snap: false
    })
    expect(rotation).toBeCloseTo(100)
  })

  it('snaps to 15 degree steps when asked', () => {
    const rotation = computeRotation({
      center: origin,
      startPoint: { x: 10, y: 0 },
      currentPoint: { x: 0, y: 10 },
      startRotation: 10,
      snap: true
    })
    expect(rotation).toBe(105)
  })

  it('wraps a rotation dragged past a half turn', () => {
    const rotation = computeRotation({
      center: origin,
      startPoint: { x: 10, y: 0 },
      currentPoint: { x: -10, y: -1 },
      startRotation: 170,
      snap: false
    })
    expect(rotation).toBeGreaterThan(-180)
    expect(rotation).toBeLessThan(180)
  })

  it('turns the corners and handles around the centre', () => {
    const [topLeft] = getRotatedCorners({ x: 0, y: 0, width: 100, height: 50 }, 90)
    expect(topLeft?.x).toBeCloseTo(75)
    expect(topLeft?.y).toBeCloseTo(-25)
    const east = getRotatedHandlePositions({ x: 0, y: 0, width: 100, height: 50 }, 90).find(
      ({ handle }) => handle === 'e'
    )
    expect(east?.point.x).toBeCloseTo(50)
    expect(east?.point.y).toBeCloseTo(75)
  })

  it('hit tests a rotated box by its turned outline', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 20 }
    expect(rotatedBoundsContainPoint(bounds, 0, { x: 50, y: 50 })).toBe(false)
    expect(rotatedBoundsContainPoint(bounds, 90, { x: 50, y: 50 })).toBe(true)
  })
})

describe('resizing a rotated box', () => {
  const start = { x: 0, y: 0, width: 100, height: 50 }

  it('matches the plain resize when not rotated', () => {
    expect(resizeRotatedBounds(start, 0, 'se', { x: 20, y: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 60
    })
  })

  it('follows the box axes and keeps the opposite edge in place on screen', () => {
    const resized = resizeRotatedBounds(start, 90, 'e', { x: 0, y: 10 })
    expect(resized.width).toBeCloseTo(110)
    expect(resized.height).toBeCloseTo(50)
    expect(resized.x).toBeCloseTo(-5)
    expect(resized.y).toBeCloseTo(5)
  })

  it('builds the update from the rotation', () => {
    const [operation] = createResizeOperations('a', start, 90, 'e', { x: 0, y: 10 })
    expect(operation?.kind).toBe('update')
  })
})

describe('rotating nodes', () => {
  const document = unwrap(
    applyOperations(createDocument('file', 'File', 'page'), [
      {
        kind: 'create',
        id: 'frame',
        type: 'frame',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 100, height: 100 }
      },
      {
        kind: 'create',
        id: 'child',
        type: 'rectangle',
        parentId: 'frame',
        properties: { x: 75, y: 40, width: 20, height: 20 }
      }
    ])
  )

  it('does nothing when the angle is unchanged', () => {
    expect(createRotateOperations(document, 'frame', 0)).toEqual([])
  })

  it('carries what the node holds around its centre', () => {
    const rotated = unwrap(applyOperations(document, createRotateOperations(document, 'frame', 90)))
    expect(rotated.nodes['frame']?.rotation).toBe(90)
    const child = rotated.nodes['child']
    expect(child?.rotation).toBe(90)
    expect(child?.x).toBeCloseTo(40)
    expect(child?.y).toBeCloseTo(75)
  })
})

describe('frame clipping in hit testing', () => {
  // A child that sticks out of its frame on the right, and a frame nested inside it.
  const document = unwrap(
    applyOperations(createDocument('file', 'File', 'page'), [
      {
        kind: 'create',
        id: 'frame',
        type: 'frame',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 100, height: 100 }
      },
      {
        kind: 'create',
        id: 'wide',
        type: 'rectangle',
        parentId: 'frame',
        properties: { x: 50, y: 10, width: 200, height: 20 }
      },
      {
        kind: 'create',
        id: 'inner',
        type: 'frame',
        parentId: 'frame',
        properties: { x: 60, y: 60, width: 200, height: 20 }
      }
    ])
  )

  it('lists the clipping frames of a node, outermost first', () => {
    expect(getClippingFrames(document, 'inner').map((frame) => frame.id)).toEqual(['frame'])
    expect(getClippingFrames(document, 'frame')).toEqual([])
  })

  it('picks a child inside its frame', () => {
    expect(findNodeAtPoint(document, { x: 80, y: 20 })?.id).toBe('wide')
  })

  it('does not pick a child outside its clipping frame', () => {
    expect(findNodeAtPoint(document, { x: 150, y: 20 })).toBeUndefined()
  })

  it('does not draw into a nested frame outside the frame holding it', () => {
    expect(findContainerAtPoint(document, { x: 150, y: 70 })).toBe('page')
    expect(findContainerAtPoint(document, { x: 80, y: 70 })).toBe('inner')
  })

  it('respects the frame rotation', () => {
    const turned = unwrap(
      applyOperations(document, [
        { kind: 'update', id: 'frame', patch: { height: 20, rotation: 90 } }
      ])
    )
    expect(findNodeAtPoint(turned, { x: 50, y: -30 })?.id).toBe('frame')
    expect(findNodeAtPoint(turned, { x: 80, y: 20 })).toBeUndefined()
  })
})
