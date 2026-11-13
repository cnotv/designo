import { createDocument, type DesignDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { moveNodeToCentrePivot } from './migrateRotationPivot.ts'
import { parseStoredDocument } from './migrations.ts'

interface Box {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface Point {
  x: number
  y: number
}

const rotate = (point: Point, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians)
  }
}

// Where a point of the node's own box lands on the page, as version 1 drew it.
const drawnAroundCorner = (box: Box, local: Point): Point => {
  const turned = rotate(local, box.rotation)
  return { x: box.x + turned.x, y: box.y + turned.y }
}

// The same, as version 2 draws it.
const drawnAroundCentre = (box: Box, local: Point): Point => {
  const turned = rotate({ x: local.x - box.width / 2, y: local.y - box.height / 2 }, box.rotation)
  return { x: box.x + box.width / 2 + turned.x, y: box.y + box.height / 2 + turned.y }
}

const corners = (box: Box): Point[] => [
  { x: 0, y: 0 },
  { x: box.width, y: 0 },
  { x: box.width, y: box.height },
  { x: 0, y: box.height }
]

const versionOneFile = (rotation: number): Record<string, unknown> => {
  const document: DesignDocument = createDocument('file-r', 'Rotated', 'page-r')
  const node = {
    ...document.nodes['page-r'],
    id: 'card',
    type: 'rectangle',
    parentId: 'page-r',
    order: 1,
    x: 40,
    y: 30,
    width: 200,
    height: 100,
    rotation
  }
  return { ...document, formatVersion: 1, nodes: { ...document.nodes, card: node } }
}

describe('migrateRotationPivot', () => {
  it.each([15, 45, 90, 135, 180, -30, 270, 400])(
    'draws a node turned %i degrees exactly where version 1 drew it',
    (rotation) => {
      const before: Box = { x: 40, y: 30, width: 200, height: 100, rotation }
      const after = moveNodeToCentrePivot(before) as Box
      corners(before).forEach((corner) => {
        const old = drawnAroundCorner(before, corner)
        const now = drawnAroundCentre(after, corner)
        expect(now.x).toBeCloseTo(old.x, 5)
        expect(now.y).toBeCloseTo(old.y, 5)
      })
    }
  )

  it('moves a quarter turn by the known amount', () => {
    expect(moveNodeToCentrePivot({ x: 0, y: 0, width: 100, height: 50, rotation: 90 })).toEqual({
      x: -75,
      y: 25,
      width: 100,
      height: 50,
      rotation: 90
    })
  })

  it('leaves unrotated and whole-turn nodes alone', () => {
    const still = { x: 1, y: 2, width: 3, height: 4, rotation: 0 }
    const full = { ...still, rotation: 360 }
    expect(moveNodeToCentrePivot(still)).toBe(still)
    expect(moveNodeToCentrePivot(full)).toBe(full)
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    const broken = { x: 'left', y: 2, width: 3, height: 4, rotation: 30 }
    expect(moveNodeToCentrePivot(broken)).toBe(broken)
    expect(() =>
      parseStoredDocument({
        ...versionOneFile(30),
        nodes: { ...(versionOneFile(30).nodes as object), card: broken }
      })
    ).toThrow()
  })

  it('upgrades a version 1 file on read, keeping its rotated layer in place', () => {
    const document = parseStoredDocument(versionOneFile(90))
    expect(document.formatVersion).toBe(2)
    expect(document.nodes['card']).toMatchObject({ x: -110, y: 80, rotation: 90 })
  })
})
