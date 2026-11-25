import type { DesignNode } from '@designo/core'
import { describe, expect, it, vi } from 'vitest'
import { createFixtureFontLibrary } from './fixtures/fontFiles.ts'
import { createFontStore } from './fontRegistry.ts'
import { createTextEngine } from './textEngine.ts'
import { toTextLayoutRequest } from './textLayoutRequest.ts'
import type { ShapingFont, TextLayoutRequest } from './types.ts'

const setup = (options: { shaping?: boolean; failLoad?: boolean; layoutLimit?: number } = {}) => {
  const shape = vi.fn((text: string): ReturnType<ShapingFont['shape']> =>
    [...text].map((_, index) => ({
      glyphId: text.charCodeAt(index),
      cluster: index,
      xAdvance: 500,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0
    }))
  )
  const font: ShapingFont = {
    metrics: { unitsPerEm: 1000, ascender: 800, descender: -200 },
    shape,
    hasGlyph: () => true,
    getGlyphOutline: () => ({ pathData: '', extents: undefined })
  }
  const loadBytes = vi.fn(async (_url: string) => {
    if (options.failLoad) throw new Error('offline')
    return new Uint8Array([1])
  })
  const library = createFixtureFontLibrary(
    createFontStore({ loadBytes, createShapingFont: async () => font })
  )
  const engine = createTextEngine({
    library,
    isShapingAvailable: () => options.shaping ?? true,
    layoutLimit: options.layoutLimit
  })
  return { engine, shape, loadBytes }
}

const request = (overrides: Partial<TextLayoutRequest> = {}): TextLayoutRequest => ({
  text: 'Hello',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: 0,
  fontSize: 20,
  lineHeight: 1.2,
  alignment: 'left',
  wrapWidth: undefined,
  spans: [],
  listStyle: 'none' as const,
  listIndent: 1.5,
  ...overrides
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createTextEngine', () => {
  it('has no layout while fonts load, then tells its listeners and has one', async () => {
    const { engine } = setup()
    const listener = vi.fn()
    engine.subscribe(listener)
    expect(engine.getLayout(request())).toBeUndefined()
    await settle()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(engine.getLayout(request())?.lines).toHaveLength(1)
  })

  it('asks for a font once however often a frame asks while it loads', async () => {
    const { engine, loadBytes } = setup()
    Array.from({ length: 50 }).forEach(() => engine.getLayout(request()))
    await settle()
    expect(loadBytes).toHaveBeenCalledTimes(1)
  })

  it('shapes a text once, however often and by however many nodes it is asked for', async () => {
    const { engine, shape } = setup()
    engine.getLayout(request())
    await settle()
    engine.getLayout(request())
    const calls = shape.mock.calls.length
    Array.from({ length: 20 }).forEach(() => engine.getLayout(request()))
    expect(shape.mock.calls.length).toBe(calls)
  })

  it('shapes again when something that changes the layout changes', async () => {
    const { engine, shape } = setup()
    engine.getLayout(request())
    await settle()
    engine.getLayout(request())
    const calls = shape.mock.calls.length
    engine.getLayout(request({ fontSize: 24 }))
    engine.getLayout(request({ alignment: 'right' }))
    engine.getLayout(request({ lineHeight: 2 }))
    engine.getLayout(request({ wrapWidth: 40 }))
    expect(shape.mock.calls.length).toBeGreaterThan(calls)
    expect(engine.getLayout(request({ wrapWidth: 40 }))?.width).toBe(40)
  })

  it('gives a node the layout of its request, wrapping only when it is a fixed-width box', async () => {
    const node = {
      text: 'one two three',
      fontFamily: 'Inter',
      fontSize: 20,
      lineHeight: 1.2,
      textAlign: 'left',
      textWrap: false,
      width: 40
    } as DesignNode
    expect(toTextLayoutRequest(node).wrapWidth).toBeUndefined()
    expect(toTextLayoutRequest({ ...node, textWrap: true }).wrapWidth).toBe(40)
  })

  it('shapes a node once and reuses the layout through its object, as panning does', async () => {
    const { engine, shape } = setup()
    const node = {
      text: 'Hello',
      fontFamily: 'Inter',
      fontSize: 20,
      lineHeight: 1.2,
      textAlign: 'left',
      textWrap: false,
      width: 50
    } as DesignNode
    engine.getNodeLayout(node)
    await settle()
    const first = engine.getNodeLayout(node)
    const calls = shape.mock.calls.length
    expect(engine.getNodeLayout(node)).toBe(first)
    expect(shape.mock.calls.length).toBe(calls)
  })

  it('does not load a font or lay anything out for a peek', async () => {
    const { engine, loadBytes } = setup()
    expect(engine.peekLayout(request())).toBeUndefined()
    await settle()
    expect(loadBytes).not.toHaveBeenCalled()
  })

  it('peeks the layout once the fonts are there', async () => {
    const { engine } = setup()
    engine.getLayout(request())
    await settle()
    expect(engine.peekLayout(request({ text: 'Something new' }))?.lines).toHaveLength(1)
  })

  it('loads the script font a text needs, and lays it out after', async () => {
    const { engine, loadBytes } = setup()
    expect(engine.getLayout(request({ text: 'שלום' }))).toBeUndefined()
    await settle()
    expect(loadBytes.mock.calls.map(([url]) => url)).toContain('NotoSansHebrew-Regular.subset.ttf')
    expect(engine.getLayout(request({ text: 'שלום' }))).toBeDefined()
  })

  it('prefers the font a family list names, and loads it', async () => {
    const { engine, loadBytes } = setup()
    engine.getLayout(request({ fontFamily: 'Noto Sans Arabic, sans-serif', text: '123' }))
    await settle()
    expect(loadBytes.mock.calls.map(([url]) => url)).toEqual(['NotoSansArabic-Regular.subset.ttf'])
  })

  it('leaves a text with an uncovered character, such as an emoji, to the fallback', async () => {
    const { engine, loadBytes } = setup()
    expect(engine.getLayout(request({ text: 'Hi 😀' }))).toBeUndefined()
    await settle()
    expect(engine.getLayout(request({ text: 'Hi 😀' }))).toBeUndefined()
    expect(loadBytes).not.toHaveBeenCalled()
  })

  it('lays out empty and space-only text without a glyph to draw', async () => {
    const { engine } = setup()
    engine.getLayout(request({ text: '' }))
    await settle()
    expect(engine.getLayout(request({ text: '' }))?.lines).toHaveLength(1)
    expect(engine.getLayout(request({ text: '   ' }))?.lines).toHaveLength(1)
  })

  it('keeps every text on the fallback where WebAssembly is missing', async () => {
    const { engine, loadBytes } = setup({ shaping: false })
    expect(engine.getLayout(request())).toBeUndefined()
    await settle()
    expect(engine.getLayout(request())).toBeUndefined()
    expect(loadBytes).not.toHaveBeenCalled()
  })

  it('stays on the fallback for a text whose fonts failed to load, without asking every frame', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { engine, loadBytes } = setup({ failLoad: true })
    engine.getLayout(request())
    await settle()
    Array.from({ length: 10 }).forEach(() => engine.getLayout(request()))
    await settle()
    expect(engine.getLayout(request())).toBeUndefined()
    expect(loadBytes).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('stops calling a listener that unsubscribed', async () => {
    const { engine } = setup()
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)
    unsubscribe()
    engine.getLayout(request())
    await settle()
    expect(listener).not.toHaveBeenCalled()
  })

  it('drops the oldest layouts past its limit and shapes them again if asked', async () => {
    const { engine, shape } = setup({ layoutLimit: 2 })
    engine.getLayout(request({ text: 'a' }))
    await settle()
    engine.getLayout(request({ text: 'a' }))
    engine.getLayout(request({ text: 'b' }))
    engine.getLayout(request({ text: 'c' }))
    const calls = shape.mock.calls.length
    engine.getLayout(request({ text: 'a' }))
    expect(shape.mock.calls.length).toBeGreaterThan(calls)
  })
})
