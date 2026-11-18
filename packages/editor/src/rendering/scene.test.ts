import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignNode
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { indexDocument } from '../editing/spatialIndex.ts'
import {
  SHAPE_INSTANCE_FLOATS,
  batchScene,
  buildScene,
  createSceneSource,
  packShapeInstances,
  parseHexColor
} from './scene.ts'
import type { SceneItem } from './types.ts'

const build = (): DesignDocument => {
  const result = applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'frame',
      type: 'frame',
      parentId: 'page',
      properties: { x: 0, y: 0, width: 400, height: 400 }
    },
    {
      kind: 'create',
      id: 'inside',
      type: 'rectangle',
      parentId: 'frame',
      properties: { x: 10, y: 10, width: 50, height: 50 }
    },
    {
      kind: 'create',
      id: 'label',
      type: 'text',
      parentId: 'frame',
      properties: { x: 10, y: 100, text: 'Hi' }
    },
    {
      kind: 'create',
      id: 'after',
      type: 'ellipse',
      parentId: 'frame',
      properties: { x: 100, y: 100, width: 40, height: 40 }
    },
    {
      kind: 'create',
      id: 'far',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 5000, y: 5000 }
    },
    {
      kind: 'create',
      id: 'top',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 200, y: 200 }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const document = build()

const nodeById = (nodeId: string): DesignNode => {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`missing ${nodeId}`)
  return node
}
const source = createSceneSource(document, indexDocument(document))
const view = { offsetX: 0, offsetY: 0, scale: 1 }
const ids = (items: readonly { node: { id: string } }[]): string[] =>
  items.map((item) => item.node.id)

describe('buildScene', () => {
  it('keeps what is in view, in paint order', () => {
    expect(ids(buildScene(source, view, { width: 800, height: 600 }))).toEqual([
      'frame',
      'inside',
      'label',
      'after',
      'top'
    ])
  })

  it('leaves out nodes outside the viewport', () => {
    const items = buildScene(
      source,
      { offsetX: -4900, offsetY: -4900, scale: 1 },
      { width: 400, height: 400 }
    )
    expect(ids(items)).toEqual(['far'])
  })

  it('follows zoom when working out what is in view', () => {
    expect(
      ids(buildScene(source, { offsetX: 0, offsetY: 0, scale: 0.1 }, { width: 800, height: 600 }))
    ).toContain('far')
  })

  it('leaves out the node being edited in place', () => {
    expect(ids(buildScene(source, view, { width: 800, height: 600 }, 'label'))).not.toContain(
      'label'
    )
  })

  it('carries the frames that clip each node', () => {
    const items = buildScene(source, view, { width: 800, height: 600 })
    expect(
      items.find((item) => item.node.id === 'inside')?.clipFrames.map((frame) => frame.id)
    ).toEqual(['frame'])
    expect(items.find((item) => item.node.id === 'top')?.clipFrames).toEqual([])
  })
})

describe('batchScene', () => {
  it('groups shapes that share clipping, and breaks the run for text', () => {
    const batches = batchScene(buildScene(source, view, { width: 800, height: 600 }))
    expect(batches.map((batch) => `${batch.kind}:${ids(batch.items).join(',')}`)).toEqual([
      'shapes:frame',
      'shapes:inside',
      'text:label',
      'shapes:after',
      'shapes:top'
    ])
  })

  it('groups consecutive texts that share clipping into one batch, for one pass over the atlas', () => {
    const text = (id: string, clipIds: string[]): SceneItem => ({
      node: { ...nodeById('label'), id },
      clipFrames: clipIds.map((clipId) => nodeById(clipId))
    })
    const batches = batchScene([
      text('one', ['frame']),
      text('two', ['frame']),
      text('three', []),
      text('four', [])
    ])
    expect(batches.map((batch) => `${batch.kind}:${ids(batch.items).join(',')}`)).toEqual([
      'text:one,two',
      'text:three,four'
    ])
  })
})

describe('parseHexColor', () => {
  it('reads #rrggbb as opaque', () => {
    expect(parseHexColor('#ff8000')).toEqual({ red: 1, green: 128 / 255, blue: 0, alpha: 1 })
  })

  it('reads #rrggbbaa', () => {
    expect(parseHexColor('#00000080').alpha).toBeCloseTo(128 / 255)
  })

  it('treats no colour as transparent', () => {
    expect(parseHexColor(null)).toEqual({ red: 0, green: 0, blue: 0, alpha: 0 })
  })
})

describe('packShapeInstances', () => {
  it('packs one instance per shape, centred, with rotation in radians and the radius kept inside the box', () => {
    const node = {
      ...nodeById('inside'),
      rotation: 90,
      cornerRadius: 999,
      fill: '#ff0000',
      stroke: null,
      opacity: 0.5
    }
    const packed = packShapeInstances([node])
    expect(packed).toHaveLength(SHAPE_INSTANCE_FLOATS)
    expect([...packed.slice(0, 9)]).toEqual([
      35,
      35,
      25,
      25,
      expect.closeTo(Math.PI / 2),
      25,
      0,
      0,
      0.5
    ])
    expect([...packed.slice(9, 13)]).toEqual([1, 0, 0, 1])
    expect(packed[16]).toBe(0)
  })

  it('marks ellipses and keeps the stroke width only with a stroke colour', () => {
    const ellipse = { ...nodeById('after'), stroke: '#000000', strokeWidth: 3 }
    const packed = packShapeInstances([ellipse])
    expect(packed[6]).toBe(1)
    expect(packed[7]).toBe(3)
  })
})
