import type { DesignNode } from '@designo/core'
import { describe, expect, it, vi } from 'vitest'
import { createGlyphAtlas } from '../text/glyphAtlas.ts'
import type { AtlasGlyph, GlyphKey, TextLayout } from '../text/types.ts'
import type { SceneItem } from '../types.ts'
import { GLYPH_INSTANCE_FLOATS, buildTextDrawList } from './glyphDrawList.ts'

const baseNode = {
  id: 'a',
  type: 'text',
  x: 100,
  y: 50,
  width: 40,
  height: 20,
  rotation: 0,
  opacity: 1,
  fill: '#ff0000',
  fontSize: 16
} as DesignNode

const item = (overrides: Partial<DesignNode> = {}): SceneItem => ({
  node: { ...baseNode, ...overrides },
  clipFrames: []
})

const glyph = (glyphId: number, x: number, y = 12) => ({
  fontId: 'inter',
  glyphId,
  x,
  y,
  cluster: 0,
  scale: 0.01
})

const layoutOf = (...glyphs: ReturnType<typeof glyph>[]): TextLayout => ({
  lines: [{ glyphs, x: 0, width: 30, top: 0, baselineY: 12, start: 0, end: 1, direction: 'ltr' }],
  width: 30,
  height: 19.2,
  lineHeight: 19.2
})

const atlasGlyph = (overrides: Partial<AtlasGlyph> = {}): AtlasGlyph => ({
  pageIndex: 0,
  rectangle: { x: 64, y: 128, width: 20, height: 40 },
  bearingX: 2,
  bearingY: 30,
  isEmpty: false,
  ...overrides
})

const createFixture = (
  layout: TextLayout | undefined,
  lookupGlyph: (key: GlyphKey) => AtlasGlyph | undefined = () => atlasGlyph()
) => ({
  engine: { getNodeLayout: vi.fn(() => layout) },
  atlas: { lookupGlyph: vi.fn(lookupGlyph), pageWidth: 1024, pageHeight: 512 }
})

const run = (
  fixture: ReturnType<typeof createFixture>,
  items: SceneItem[],
  devicePixelsPerUnit = 2
) => buildTextDrawList({ items, devicePixelsPerUnit, ...fixture })

describe('buildTextDrawList', () => {
  it('puts one quad per glyph at the glyph origin plus the bitmap bearings, scaled from the bucket to the font size', () => {
    const fixture = createFixture(layoutOf(glyph(7, 3)))
    const list = run(fixture, [item()])
    // 16 world units at 2 device pixels is 32 pixels per em, which is the bucket, so one bitmap
    // pixel is half a world unit.
    expect(list.instances).toHaveLength(GLYPH_INSTANCE_FLOATS)
    const [originX, originY, width, height, cosine, sine, u0, v0, u1, v1] = list.instances
    expect(originX).toBeCloseTo(100 + 3 + 2 * 0.5)
    expect(originY).toBeCloseTo(50 + 12 - 30 * 0.5)
    expect(width).toBeCloseTo(20 * 0.5)
    expect(height).toBeCloseTo(40 * 0.5)
    expect([cosine, sine]).toEqual([1, 0])
    expect([u0, v0, u1, v1]).toEqual([64 / 1024, 128 / 512, 84 / 1024, 168 / 512])
  })

  it('asks the atlas for the zoom bucket of the size on screen', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0)))
    run(fixture, [item({ fontSize: 16 })], 2)
    run(fixture, [item({ fontSize: 16 })], 5)
    expect(fixture.atlas.lookupGlyph.mock.calls.map(([key]) => key.zoomBucket)).toEqual([32, 128])
  })

  it('premultiplies the fill by its alpha and the node opacity', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0)))
    const { instances } = run(fixture, [item({ fill: '#ff000080', opacity: 0.5 })])
    const alpha = (128 / 255) * 0.5
    expect(instances[10]).toBeCloseTo(alpha)
    expect(instances[11]).toBe(0)
    expect(instances[13]).toBeCloseTo(alpha)
  })

  it('draws a node with no fill black, as the Canvas 2D path does', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0)))
    const { instances } = run(fixture, [item({ fill: null })])
    expect([instances[10], instances[11], instances[12], instances[13]]).toEqual([0, 0, 0, 1])
  })

  it('turns every quad around the node centre with the node', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0, 0)), () =>
      atlasGlyph({ bearingX: 0, bearingY: 0 })
    )
    const { instances } = run(fixture, [item({ rotation: 90 })])
    // The glyph origin is the node's top left, (-20, -10) from its centre (120, 60); a quarter turn
    // sends that to (130, 40).
    expect(instances[0]).toBeCloseTo(130)
    expect(instances[1]).toBeCloseTo(40)
    expect(instances[4]).toBeCloseTo(0)
    expect(instances[5]).toBeCloseTo(1)
  })

  it('draws nothing for a glyph with no pixels, such as a space, and does not fall back', () => {
    const fixture = createFixture(layoutOf(glyph(1, 0), glyph(2, 8)), (key) =>
      key.glyphId === 1 ? atlasGlyph({ isEmpty: true }) : atlasGlyph()
    )
    const list = run(fixture, [item()])
    expect(list.instances).toHaveLength(GLYPH_INSTANCE_FLOATS)
    expect(list.steps).toEqual([
      { kind: 'glyphs', pageIndex: 0, firstInstance: 0, instanceCount: 1 }
    ])
  })

  it('merges runs on the same page across nodes and splits where the page changes', () => {
    const pageByGlyph: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 0 }
    const layouts: Record<string, TextLayout> = {
      a: layoutOf(glyph(1, 0), glyph(2, 8)),
      b: layoutOf(glyph(3, 0)),
      c: layoutOf(glyph(4, 0))
    }
    const fixture = createFixture(undefined, (key) =>
      atlasGlyph({ pageIndex: pageByGlyph[key.glyphId] ?? 0 })
    )
    fixture.engine.getNodeLayout.mockImplementation(
      ((node: DesignNode) => layouts[node.id]) as never
    )
    const list = run(fixture, [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })])
    expect(list.steps).toEqual([
      { kind: 'glyphs', pageIndex: 0, firstInstance: 0, instanceCount: 2 },
      { kind: 'glyphs', pageIndex: 1, firstInstance: 2, instanceCount: 1 },
      { kind: 'glyphs', pageIndex: 0, firstInstance: 3, instanceCount: 1 }
    ])
  })

  it('leaves a node to the fallback while it has no layout, in its place in the paint order', () => {
    const layouts: Record<string, TextLayout | undefined> = {
      a: layoutOf(glyph(1, 0)),
      b: undefined,
      c: layoutOf(glyph(1, 0))
    }
    const fixture = createFixture(undefined)
    fixture.engine.getNodeLayout.mockImplementation(
      ((node: DesignNode) => layouts[node.id]) as never
    )
    const list = run(fixture, [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })])
    expect(
      list.steps.map((step) => (step.kind === 'fallback' ? `fallback:${step.node.id}` : 'glyphs'))
    ).toEqual(['glyphs', 'fallback:b', 'glyphs'])
  })

  it('takes back a node whose glyph the atlas could not place, so it is drawn whole by the fallback', () => {
    const fixture = createFixture(layoutOf(glyph(1, 0), glyph(2, 8), glyph(3, 16)), (key) =>
      key.glyphId === 3 ? undefined : atlasGlyph()
    )
    const list = run(fixture, [item()])
    expect(list.instances).toHaveLength(0)
    expect(list.steps).toEqual([{ kind: 'fallback', node: expect.objectContaining({ id: 'a' }) }])
  })

  it('keeps what earlier nodes placed when a later node falls back', () => {
    const fixture = createFixture(undefined, (key) =>
      key.glyphId === 9 ? undefined : atlasGlyph()
    )
    const layouts: Record<string, TextLayout> = {
      a: layoutOf(glyph(1, 0)),
      b: layoutOf(glyph(1, 0), glyph(9, 8))
    }
    fixture.engine.getNodeLayout.mockImplementation(
      ((node: DesignNode) => layouts[node.id]) as never
    )
    const list = run(fixture, [item({ id: 'a' }), item({ id: 'b' })])
    expect(list.instances).toHaveLength(GLYPH_INSTANCE_FLOATS)
    expect(list.steps.map((step) => step.kind)).toEqual(['glyphs', 'fallback'])
  })

  it('leaves text too large to rasterise sharply to the fallback', () => {
    const fixture = createFixture(layoutOf(glyph(1, 0)))
    const list = run(fixture, [item({ fontSize: 400 })], 2)
    expect(list.steps).toEqual([{ kind: 'fallback', node: expect.objectContaining({ id: 'a' }) }])
    expect(fixture.atlas.lookupGlyph).not.toHaveBeenCalled()
  })

  it('draws an empty layout as nothing at all', () => {
    const fixture = createFixture({ lines: [], width: 0, height: 0, lineHeight: 19.2 })
    const list = run(fixture, [item()])
    expect(list.instances).toHaveLength(0)
    expect(list.steps).toEqual([])
  })
})

describe('buildTextDrawList with the real atlas', () => {
  const createCountingFixture = () => {
    const rasterizeGlyph = vi.fn((key: GlyphKey) => ({
      width: 4,
      height: 4,
      bearingX: 0,
      bearingY: 4,
      pixels: new Uint8Array(16).fill(key.zoomBucket)
    }))
    const atlas = createGlyphAtlas({
      pageWidth: 256,
      pageHeight: 256,
      maxPages: 2,
      padding: 1,
      rasterizeGlyph
    })
    const layout = layoutOf(glyph(1, 0), glyph(2, 8), glyph(1, 16))
    const engine = { getNodeLayout: () => layout }
    const draw = (count: number, devicePixelsPerUnit: number) => {
      atlas.beginFrame()
      return buildTextDrawList({
        items: Array.from({ length: count }, (_, index) => item({ id: `n${index}` })),
        devicePixelsPerUnit,
        engine,
        atlas
      })
    }
    return { rasterizeGlyph, atlas, draw }
  }

  it('draws one glyph once per bucket, however many nodes and uses it has', () => {
    const { rasterizeGlyph, draw } = createCountingFixture()
    const list = draw(500, 2)
    expect(list.instances).toHaveLength(500 * 3 * GLYPH_INSTANCE_FLOATS)
    expect(rasterizeGlyph).toHaveBeenCalledTimes(2)
  })

  it('draws nothing again when the zoom changes inside a bucket', () => {
    const { rasterizeGlyph, draw } = createCountingFixture()
    draw(10, 1.2)
    const calls = rasterizeGlyph.mock.calls.length
    // 16 world units at 1.2 and at 2 device pixels per unit are 19 and 32 per em: buckets 32 and 32.
    draw(10, 2)
    expect(rasterizeGlyph.mock.calls.length).toBe(calls)
  })

  it('draws the glyphs again when the zoom crosses into another bucket', () => {
    const { rasterizeGlyph, draw } = createCountingFixture()
    draw(10, 2)
    draw(10, 4)
    expect(rasterizeGlyph.mock.calls.map(([key]) => key.zoomBucket).toSorted()).toEqual([
      32, 32, 64, 64
    ])
  })
})
