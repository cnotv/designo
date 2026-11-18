import { describe, expect, it, vi } from 'vitest'
import { FIXTURE_FONT_CATALOG } from './fixtures/fontFiles.ts'
import {
  compileFontCatalog,
  createFontRegistry,
  createFontStore,
  findFontForCodePoint,
  splitIntoFontRuns
} from './fontRegistry.ts'
import type { ShapingFont } from './types.ts'

const catalog = FIXTURE_FONT_CATALOG

const describeRuns = (text: string) =>
  splitIntoFontRuns(text, catalog).map((run) => [run.fontId, text.slice(run.start, run.end)])

describe('compileFontCatalog', () => {
  it('reads ranges and single code points as numbers', () => {
    const compiled = compileFontCatalog({
      defaultFontId: 'a',
      fonts: [{ id: 'a', family: 'A', url: 'a.ttf', coverage: ['U+0600-06FF', 'u+00a0'] }]
    })
    expect(compiled.fonts[0]?.coverage).toEqual([
      [0x600, 0x6ff],
      [0xa0, 0xa0]
    ])
  })

  it('rejects a range it cannot read', () => {
    expect(() =>
      compileFontCatalog({
        defaultFontId: 'a',
        fonts: [{ id: 'a', family: 'A', url: 'a.ttf', coverage: ['0600'] }]
      })
    ).toThrow('Not a code point range')
  })
})

describe('findFontForCodePoint', () => {
  it('keeps the current font when it covers the character', () => {
    expect(findFontForCodePoint(catalog, '1'.codePointAt(0) ?? 0, 'noto-sans-arabic')).toBe(
      'noto-sans-arabic'
    )
  })

  it('picks the first font that covers a character the current font lacks', () => {
    expect(findFontForCodePoint(catalog, 0x05d0, 'inter')).toBe('noto-sans-hebrew')
    expect(findFontForCodePoint(catalog, 0x0915, undefined)).toBe('noto-sans-devanagari')
  })

  it('falls back to the default font for a character nothing covers', () => {
    expect(findFontForCodePoint(catalog, 0x1f600, 'noto-sans-arabic')).toBe('inter')
  })
})

describe('splitIntoFontRuns', () => {
  it('has no runs for an empty string', () => {
    expect(splitIntoFontRuns('', catalog)).toEqual([])
  })

  it('keeps Latin, Greek and Cyrillic in the default font', () => {
    expect(describeRuns('Hello Привет Ωμέγα')).toEqual([['inter', 'Hello Привет Ωμέγα']])
  })

  it('switches font where the script changes', () => {
    expect(describeRuns('Hello שלום')).toEqual([
      ['inter', 'Hello '],
      ['noto-sans-hebrew', 'שלום']
    ])
  })

  it('keeps spaces and digits inside an Arabic run in the Arabic font', () => {
    expect(describeRuns('مرحبا 123 abc')).toEqual([
      ['noto-sans-arabic', 'مرحبا 123 '],
      ['inter', 'abc']
    ])
  })

  it('counts a character outside the basic plane as two UTF-16 units', () => {
    const [run] = splitIntoFontRuns('😀', catalog)
    expect(run).toEqual({ fontId: 'inter', start: 0, end: 2 })
  })

  it('covers the whole string with runs that touch end to start', () => {
    const text = 'a ב क 😀 z'
    const runs = splitIntoFontRuns(text, catalog)
    expect(runs[0]?.start).toBe(0)
    expect(runs.at(-1)?.end).toBe(text.length)
    expect(runs.slice(1).every((run, index) => run.start === runs[index]?.end)).toBe(true)
  })
})

const createFakeFont = (): ShapingFont => ({
  metrics: { unitsPerEm: 1000, ascender: 800, descender: -200 },
  shape: () => [],
  hasGlyph: () => true,
  getGlyphOutline: () => ({ pathData: '', extents: undefined })
})

describe('createFontRegistry', () => {
  const createFixture = () => {
    const loadBytes = vi.fn(async (_url: string) => new Uint8Array([1]))
    const createShapingFont = vi.fn(async (_bytes: Uint8Array) => createFakeFont())
    const registry = createFontRegistry({
      catalog,
      store: createFontStore({ loadBytes, createShapingFont })
    })
    return { loadBytes, createShapingFont, registry }
  }

  it('has no font before anything loads', () => {
    const { registry } = createFixture()
    expect(registry.getFont('inter')).toBeUndefined()
  })

  it('loads only the default font for Latin text', async () => {
    const { registry, loadBytes } = createFixture()
    await registry.loadFontsForText('Hello')
    expect(loadBytes.mock.calls.map(([url]) => url)).toEqual(['Inter-Regular.subset.ttf'])
    expect(registry.getFont('inter')).toBeDefined()
    expect(registry.getFont('noto-sans-arabic')).toBeUndefined()
  })

  it('loads a script font lazily, with the default font', async () => {
    const { registry, loadBytes } = createFixture()
    await registry.loadFontsForText('שלום')
    expect(loadBytes.mock.calls.map(([url]) => url).toSorted()).toEqual([
      'Inter-Regular.subset.ttf',
      'NotoSansHebrew-Regular.subset.ttf'
    ])
  })

  it('loads one font by id, once', async () => {
    const { registry, loadBytes } = createFixture()
    await Promise.all([
      registry.loadFont('noto-sans-arabic'),
      registry.loadFont('noto-sans-arabic')
    ])
    expect(loadBytes.mock.calls.map(([url]) => url)).toEqual(['NotoSansArabic-Regular.subset.ttf'])
  })

  it('rejects a font id the catalog does not have', async () => {
    const { registry } = createFixture()
    await expect(registry.loadFont('nope')).rejects.toThrow('Unknown font nope')
  })

  it('loads each font once however many texts ask for it at the same time', async () => {
    const { registry, loadBytes } = createFixture()
    await Promise.all([
      registry.loadFontsForText('שלום'),
      registry.loadFontsForText('שלום Hello'),
      registry.loadFontsForText('Hello')
    ])
    await registry.loadFontsForText('שלום')
    expect(loadBytes).toHaveBeenCalledTimes(2)
  })

  it('tries again after a failed load instead of remembering the failure', async () => {
    const loadBytes = vi
      .fn<(url: string) => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Uint8Array([1]))
    const registry = createFontRegistry({
      catalog,
      store: createFontStore({ loadBytes, createShapingFont: async () => createFakeFont() })
    })
    await expect(registry.loadFontsForText('Hello')).rejects.toThrow('offline')
    await registry.loadFontsForText('Hello')
    expect(registry.getFont('inter')).toBeDefined()
  })

  it('passes a character on when a loaded font lacks it though its range names it', async () => {
    const arrows = compileFontCatalog({
      defaultFontId: 'latin',
      fonts: [
        { id: 'latin', family: 'A', url: 'latin.ttf', coverage: ['U+0000-00FF', 'U+2192'] },
        { id: 'symbols', family: 'B', url: 'symbols.ttf', coverage: ['U+2190-21FF'] }
      ]
    })
    const fonts: Record<string, ShapingFont> = {
      'latin.ttf': { ...createFakeFont(), hasGlyph: (codePoint) => codePoint < 0x100 },
      'symbols.ttf': createFakeFont()
    }
    const loadBytes = vi.fn(async (url: string) => new TextEncoder().encode(url))
    const registry = createFontRegistry({
      catalog: arrows,
      store: createFontStore({
        loadBytes,
        createShapingFont: async (bytes) => {
          const font = fonts[new TextDecoder().decode(bytes)]
          if (!font) throw new Error('unknown font')
          return font
        }
      })
    })
    expect(splitIntoFontRuns('a→', arrows).map((run) => run.fontId)).toEqual(['latin'])
    await registry.loadFontsForText('a→')
    expect(loadBytes.mock.calls.map(([url]) => url)).toEqual(['latin.ttf', 'symbols.ttf'])
    expect(splitIntoFontRuns('a→', arrows, registry.getFont).map((run) => run.fontId)).toEqual([
      'latin',
      'symbols'
    ])
  })
})
