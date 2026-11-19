import { applyOperations, createDocument, type DesignDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { boundsIntersect } from './geometry.ts'
import {
  createSpatialIndex,
  getDrawnBounds,
  indexDocument,
  searchSpatialIndex
} from './spatialIndex.ts'
import type { Bounds, SpatialEntry } from './types.ts'

// A small seeded generator, so a failing case is the same on every run.
const createRandom = (seed: number) => {
  const state = { value: seed }
  return (): number => {
    state.value = (state.value * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state.value / 4_294_967_296
  }
}

const randomEntries = (count: number, seed: number): SpatialEntry[] => {
  const random = createRandom(seed)
  return Array.from({ length: count }, (_, position) => ({
    id: `node-${position}`,
    order: position,
    bounds: {
      x: random() * 10_000 - 5000,
      y: random() * 10_000 - 5000,
      width: random() * 300,
      height: random() * 300
    }
  }))
}

const bruteForce = (entries: readonly SpatialEntry[], area: Bounds): string[] =>
  entries.filter((entry) => boundsIntersect(entry.bounds, area)).map((entry) => entry.id)

const sorted = (ids: readonly string[]): string[] => [...ids].toSorted()

describe('spatial index', () => {
  it('finds nothing in an empty index', () => {
    expect(
      searchSpatialIndex(createSpatialIndex([]), { x: 0, y: 0, width: 10, height: 10 })
    ).toEqual([])
  })

  it('finds a single entry, edges included', () => {
    const index = createSpatialIndex([
      { id: 'a', order: 0, bounds: { x: 0, y: 0, width: 10, height: 10 } }
    ])
    expect(searchSpatialIndex(index, { x: 10, y: 10, width: 5, height: 5 })).toEqual(['a'])
    expect(searchSpatialIndex(index, { x: 11, y: 0, width: 5, height: 5 })).toEqual([])
  })

  it('answers every query the same as checking each entry', () => {
    const entries = randomEntries(5000, 7)
    const index = createSpatialIndex(entries)
    const random = createRandom(99)
    Array.from({ length: 200 }).forEach(() => {
      const area = {
        x: random() * 12_000 - 6000,
        y: random() * 12_000 - 6000,
        width: random() * 3000,
        height: random() * 3000
      }
      expect(sorted(searchSpatialIndex(index, area))).toEqual(sorted(bruteForce(entries, area)))
    })
  })

  it('keeps every entry exactly once', () => {
    const entries = randomEntries(1234, 3)
    const everything = { x: -1e9, y: -1e9, width: 2e9, height: 2e9 }
    expect(sorted(searchSpatialIndex(createSpatialIndex(entries), everything))).toEqual(
      sorted(entries.map((entry) => entry.id))
    )
  })

  it('stays shallow, so a search does not grow with the entry count', () => {
    const index = createSpatialIndex(randomEntries(20_000, 11))
    expect(index.depth).toBeLessThanOrEqual(4)
  })
})

const unwrap = (document: DesignDocument | undefined): DesignDocument => {
  if (!document) throw new Error('setup failed')
  return document
}

const buildDocument = (): DesignDocument => {
  const result = applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'box',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 0, y: 0, width: 100, height: 20 }
    },
    {
      kind: 'create',
      id: 'turned',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 200, y: 0, width: 100, height: 20, rotation: 90 }
    },
    {
      kind: 'create',
      id: 'hidden',
      type: 'ellipse',
      parentId: 'page',
      properties: { x: 0, y: 0, visible: false }
    },
    { kind: 'create', id: 'group', type: 'group', parentId: 'page' },
    {
      kind: 'create',
      id: 'outlined',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 500, y: 0, width: 10, height: 10, stroke: '#000000', strokeWidth: 4 }
    }
  ])
  return unwrap(result.ok ? result.document : undefined)
}

describe('indexDocument', () => {
  const document = buildDocument()

  it('indexes what is drawn, not hidden nodes or groups', () => {
    const everything = { x: -1e6, y: -1e6, width: 2e6, height: 2e6 }
    expect(sorted(searchSpatialIndex(indexDocument(document), everything))).toEqual([
      'box',
      'outlined',
      'turned'
    ])
  })

  it('covers a rotated node where it is drawn', () => {
    const turned = document.nodes.turned
    if (!turned) throw new Error('setup failed')
    const drawn = getDrawnBounds(turned)
    expect(drawn.x).toBeCloseTo(240)
    expect(drawn.y).toBeCloseTo(-40)
    expect(drawn.width).toBeCloseTo(20)
    expect(drawn.height).toBeCloseTo(100)
  })

  it('counts half the stroke, which is drawn outside the box', () => {
    const outlined = document.nodes.outlined
    if (!outlined) throw new Error('setup failed')
    expect(getDrawnBounds(outlined)).toEqual({ x: 498, y: -2, width: 14, height: 14 })
  })
})
