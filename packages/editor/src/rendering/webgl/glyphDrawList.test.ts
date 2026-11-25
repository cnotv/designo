import type { DesignNode } from '@designo/core'
import { describe, expect, it, vi } from 'vitest'
import { createGlyphAtlas } from '../text/glyphAtlas.ts'
import type { AtlasGlyph, GlyphKey, TextLayout } from '@designo/text'
import type { SceneItem, TextDrawList } from '../types.ts'
import { GLYPH_BYTES, buildTextDrawList } from './glyphDrawList.ts'

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

const glyph = (glyphId: number, x: number, y = 12, fill?: string) => ({
  fontId: 'inter',
  glyphId,
  x,
  y,
  cluster: 0,
  scale: 0.01,
  ...(fill === undefined ? {} : { fill })
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

// Reads the packed vertex data back: each glyph's four corners with position, atlas position and
// the premultiplied colour as bytes.
const readQuads = (list: TextDrawList) => {
  const floats = new Float32Array(
    list.vertices.buffer,
    list.vertices.byteOffset,
    list.vertices.byteLength / 4
  )
  const words = new Uint32Array(
    list.vertices.buffer,
    list.vertices.byteOffset,
    list.vertices.byteLength / 4
  )
  return Array.from({ length: list.vertices.byteLength / GLYPH_BYTES }, (_, glyph) =>
    Array.from({ length: 4 }, (_unused, corner) => {
      const base = glyph * 16 + corner * 4
      const uv = words[base + 2] ?? 0
      const color = words[base + 3] ?? 0
      return {
        x: floats[base] ?? 0,
        y: floats[base + 1] ?? 0,
        u: (uv & 0xffff) / 65535,
        v: (uv >>> 16) / 65535,
        color: [color & 0xff, (color >>> 8) & 0xff, (color >>> 16) & 0xff, color >>> 24]
      }
    })
  )
}

const run = (
  fixture: ReturnType<typeof createFixture>,
  items: SceneItem[],
  devicePixelsPerUnit = 2,
  offset = { x: 0, y: 0 }
) =>
  buildTextDrawList({
    items,
    view: { devicePixelsPerUnit, deviceOffsetX: offset.x, deviceOffsetY: offset.y },
    ...fixture
  })

describe('buildTextDrawList', () => {
  it('puts one quad per glyph at the glyph origin plus the bitmap bearings, scaled from the bucket to the font size', () => {
    const fixture = createFixture(layoutOf(glyph(7, 3)))
    // 16 world units at 2 device pixels is 32 pixels per em, which is the bucket, so one bitmap
    // pixel is half a world unit.
    const quads = readQuads(run(fixture, [item()]))
    expect(quads).toHaveLength(1)
    const corners = (quads[0] ?? []).map(({ x, y }) => [x, y])
    const left = 100 + 3 + 2 * 0.5
    const top = 50 + 12 - 30 * 0.5
    const expected = [
      [left, top],
      [left + 10, top],
      [left, top + 20],
      [left + 10, top + 20]
    ]
    corners.forEach(([x, y], corner) => {
      expect(x).toBeCloseTo(expected[corner]?.[0] ?? Number.NaN)
      expect(y).toBeCloseTo(expected[corner]?.[1] ?? Number.NaN)
    })
  })

  it('points each corner at its corner of the glyph in the atlas page', () => {
    const fixture = createFixture(layoutOf(glyph(7, 3)))
    const [quad = []] = readQuads(run(fixture, [item()]))
    const expected = [
      [64 / 1024, 128 / 512],
      [84 / 1024, 128 / 512],
      [64 / 1024, 168 / 512],
      [84 / 1024, 168 / 512]
    ]
    quad.forEach(({ u, v }, corner) => {
      expect(u).toBeCloseTo(expected[corner]?.[0] ?? Number.NaN, 4)
      expect(v).toBeCloseTo(expected[corner]?.[1] ?? Number.NaN, 4)
    })
  })

  it('asks the atlas for the zoom bucket of the size on screen', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0)))
    run(fixture, [item({ fontSize: 16 })], 2)
    run(fixture, [item({ fontSize: 16 })], 5)
    expect(fixture.atlas.lookupGlyph.mock.calls.map(([key]) => key.zoomBucket)).toEqual([32, 128])
  })

  it('premultiplies the fill by its alpha and the node opacity, as bytes', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0)))
    const [quad] = readQuads(run(fixture, [item({ fill: '#ff000080', opacity: 0.5 })]))
    const alpha = Math.round((128 / 255) * 0.5 * 255)
    expect(
      quad?.every(({ color }) => color[0] === alpha && color[1] === 0 && color[3] === alpha)
    ).toBe(true)
  })

  it('draws a glyph in the colour of its span and the others in the node fill', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0), glyph(8, 12, 12, '#00ff00')))
    const quads = readQuads(run(fixture, [item({ fill: '#ff0000', opacity: 0.5 })]))
    const half = Math.round(0.5 * 255)
    expect(quads[0]?.[0]?.color).toEqual([half, 0, 0, half])
    expect(quads[1]?.[0]?.color).toEqual([0, half, 0, half])
  })

  it('draws a node with no fill black, as the Canvas 2D path does', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0)))
    const [quad] = readQuads(run(fixture, [item({ fill: null })]))
    expect(quad?.[0]?.color).toEqual([0, 0, 0, 255])
  })

  it('puts an upright glyph on whole device pixels, so it is not filtered across two', () => {
    const fixture = createFixture(layoutOf(glyph(7, 3.2)), () =>
      atlasGlyph({ bearingX: 0, bearingY: 0 })
    )
    const [quad] = readQuads(run(fixture, [item({ x: 100.1, y: 50.3 })], 2, { x: 0.4, y: 0.7 }))
    const corner = quad?.[0]
    // Device position (world * 2 + offset) is a whole number: 2 * x + 0.4 and 2 * y + 0.7.
    expect(((corner?.x ?? 0) * 2 + 0.4) % 1).toBeCloseTo(0, 4)
    expect(((corner?.y ?? 0) * 2 + 0.7) % 1).toBeCloseTo(0, 4)
  })

  it('leaves a turned glyph where it is, since moving its corners would bend it', () => {
    const fixture = createFixture(layoutOf(glyph(7, 3.2)), () =>
      atlasGlyph({ bearingX: 0, bearingY: 0 })
    )
    const [quad] = readQuads(run(fixture, [item({ rotation: 30 })], 2, { x: 0.4, y: 0.7 }))
    const device = (quad?.[0]?.x ?? 0) * 2 + 0.4
    expect(Math.abs(device - Math.round(device))).toBeGreaterThan(0.001)
  })

  it('turns every corner around the node centre with the node', () => {
    const fixture = createFixture(layoutOf(glyph(7, 0, 0)), () =>
      atlasGlyph({ bearingX: 0, bearingY: 0 })
    )
    const [quad] = readQuads(run(fixture, [item({ rotation: 90 })]))
    // The glyph origin is the node's top left, (-20, -10) from its centre (120, 60); a quarter turn
    // sends that to (130, 40). The quad's width of 10 then runs down the screen, not across.
    expect(quad?.[0]?.x).toBeCloseTo(130)
    expect(quad?.[0]?.y).toBeCloseTo(40)
    expect(quad?.[1]?.x).toBeCloseTo(130)
    expect(quad?.[1]?.y).toBeCloseTo(50)
  })

  it('draws nothing for a glyph with no pixels, such as a space, and does not fall back', () => {
    const fixture = createFixture(layoutOf(glyph(1, 0), glyph(2, 8)), (key) =>
      key.glyphId === 1 ? atlasGlyph({ isEmpty: true }) : atlasGlyph()
    )
    const list = run(fixture, [item()])
    expect(list.vertices).toHaveLength(GLYPH_BYTES)
    expect(list.steps).toEqual([{ kind: 'glyphs', pageIndex: 0, firstGlyph: 0, glyphCount: 1 }])
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
      { kind: 'glyphs', pageIndex: 0, firstGlyph: 0, glyphCount: 2 },
      { kind: 'glyphs', pageIndex: 1, firstGlyph: 2, glyphCount: 1 },
      { kind: 'glyphs', pageIndex: 0, firstGlyph: 3, glyphCount: 1 }
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
    expect(list.vertices).toHaveLength(0)
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
    expect(list.vertices).toHaveLength(GLYPH_BYTES)
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
    expect(list.vertices).toHaveLength(0)
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
        view: { devicePixelsPerUnit, deviceOffsetX: 0, deviceOffsetY: 0 },
        engine,
        atlas
      })
    }
    return { rasterizeGlyph, atlas, draw }
  }

  it('draws one glyph once per bucket, however many nodes and uses it has', () => {
    const { rasterizeGlyph, draw } = createCountingFixture()
    const list = draw(500, 2)
    expect(list.vertices).toHaveLength(500 * 3 * GLYPH_BYTES)
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

describe('buildTextDrawList while the atlas evicts', () => {
  // A page holds one 30 by 30 glyph, so every new glyph past the second page clears a page.
  const createTinyFixture = () => {
    const atlas = createGlyphAtlas({
      pageWidth: 32,
      pageHeight: 32,
      maxPages: 2,
      padding: 1,
      rasterizeGlyph: (key) => ({
        width: 28,
        height: 28,
        bearingX: 0,
        bearingY: 28,
        pixels: new Uint8Array(28 * 28).fill(key.glyphId)
      })
    })
    const layouts: Record<string, TextLayout> = {
      first: layoutOf(glyph(1, 0), glyph(2, 8)),
      second: layoutOf(glyph(3, 0), glyph(4, 8)),
      third: layoutOf(glyph(5, 0), glyph(6, 8), glyph(7, 16))
    }
    const engine = { getNodeLayout: (node: DesignNode) => layouts[node.id] }
    const draw = (...ids: string[]) => {
      atlas.beginFrame()
      return buildTextDrawList({
        items: ids.map((id) => item({ id })),
        view: { devicePixelsPerUnit: 2, deviceOffsetX: 0, deviceOffsetY: 0 },
        engine,
        atlas
      })
    }
    return { atlas, draw }
  }

  it('places a later frame by evicting a page the earlier frame used, and queues its clear', () => {
    const { atlas, draw } = createTinyFixture()
    draw('first')
    atlas.takePendingUploads()
    const list = draw('second')
    expect(list.steps.every((step) => step.kind === 'glyphs')).toBe(true)
    expect(atlas.takeClearedPages().toSorted()).toEqual([0, 1])
  })

  it('never takes a page from a glyph already placed in the same frame: the node that does not fit is drawn by the fallback whole', () => {
    const { atlas, draw } = createTinyFixture()
    const list = draw('first', 'third')
    // Both pages are in use by the first node's two glyphs, so the third node's glyphs have no
    // room, and it falls back instead of overwriting them.
    expect(list.steps.map((step) => step.kind)).toEqual(['glyphs', 'glyphs', 'fallback'])
    expect(list.vertices).toHaveLength(2 * GLYPH_BYTES)
    expect(atlas.takeClearedPages()).toEqual([])
  })

  it('draws the glyphs it lost again when they are next shown, without a gap in between', () => {
    const { draw } = createTinyFixture()
    draw('first')
    draw('second')
    const again = draw('first')
    expect(again.steps.every((step) => step.kind === 'glyphs')).toBe(true)
    expect(again.vertices).toHaveLength(2 * GLYPH_BYTES)
  })
})
