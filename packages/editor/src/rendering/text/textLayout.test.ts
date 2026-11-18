import { beforeAll, describe, expect, it } from 'vitest'
import type { TextAlign } from '@designo/core'
import { getTextBaselineOffset } from '../../editing/geometry.ts'
import { BUNDLED_FONT_CATALOG } from './bundledFontCatalog.ts'
import { readBundledFontBytes } from './fixtures/fontFiles.ts'
import { createFontRegistry } from './fontRegistry.ts'
import { createHarfBuzzShapingFont } from './harfBuzzFont.ts'
import { layoutText } from './textLayout.ts'
import { createTextShaper } from './textShaper.ts'
import type { TextLayoutInput, TextShaper } from './types.ts'

// A shaper with no font: every UTF-16 unit is one glyph, 500 units wide in a 1000-unit em, so at
// font size 20 each character is 10 world units wide and the arithmetic can be done by eye.
const monospaceShaper: TextShaper = {
  shapeRuns: (text, direction) => {
    const glyphs = [...text].map((_, index) => ({
      glyphId: text.charCodeAt(index),
      cluster: index,
      xAdvance: 500,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0
    }))
    return [
      {
        fontId: 'mono',
        direction,
        unitsPerEm: 1000,
        glyphs: direction === 'rtl' ? glyphs.toReversed() : glyphs
      }
    ]
  },
  getPrimaryMetrics: () => ({ unitsPerEm: 1000, ascender: 800, descender: -200 })
}

const FONT_SIZE = 20
const CHARACTER_WIDTH = 10
const LINE_HEIGHT_MULTIPLE = 1.2
const LINE_HEIGHT = FONT_SIZE * LINE_HEIGHT_MULTIPLE

const layout = (text: string, options: Partial<TextLayoutInput> = {}) =>
  layoutText(
    {
      text,
      fontSize: FONT_SIZE,
      alignment: 'left',
      lineHeight: LINE_HEIGHT_MULTIPLE,
      wrapWidth: undefined,
      ...options
    },
    monospaceShaper
  )

const clustersOf = (result: ReturnType<typeof layout>, lineIndex: number) =>
  result.lines[lineIndex]?.glyphs.map((glyph) => glyph.cluster)

describe('layoutText without wrapping', () => {
  it('lays a line out from the origin, a character at a time, on the baseline', () => {
    const result = layout('hello')
    const [line] = result.lines
    expect(line?.glyphs.map((glyph) => glyph.x)).toEqual([0, 10, 20, 30, 40])
    expect(new Set(line?.glyphs.map((glyph) => glyph.y))).toEqual(
      new Set([getTextBaselineOffset(0, FONT_SIZE, LINE_HEIGHT_MULTIPLE, 16, 4)])
    )
    expect(line?.glyphs[0]).toMatchObject({ fontId: 'mono', glyphId: 104, scale: 0.02 })
  })

  it('sizes the box to the widest line and the number of lines', () => {
    const result = layout('abcd\nab')
    expect(result.width).toBe(4 * CHARACTER_WIDTH)
    expect(result.height).toBe(2 * LINE_HEIGHT)
    expect(result.lineHeight).toBe(LINE_HEIGHT)
  })

  it('starts each hard line lower by the line height, with clusters into the whole text', () => {
    const result = layout('ab\ncd')
    expect(result.lines).toHaveLength(2)
    expect(result.lines[1]?.top).toBe(LINE_HEIGHT)
    expect(result.lines[1]?.baselineY).toBe(
      getTextBaselineOffset(1, FONT_SIZE, LINE_HEIGHT_MULTIPLE, 16, 4)
    )
    expect(clustersOf(result, 1)).toEqual([3, 4])
    expect(result.lines[1]).toMatchObject({ start: 3, end: 5 })
  })

  it('keeps a blank line as a line with no glyphs', () => {
    const result = layout('a\n\nb')
    expect(result.lines.map((line) => line.glyphs.length)).toEqual([1, 0, 1])
    expect(result.height).toBe(3 * LINE_HEIGHT)
  })

  it('has one empty line for empty text, with no width', () => {
    const result = layout('')
    expect(result.lines).toHaveLength(1)
    expect(result).toMatchObject({ width: 0, height: LINE_HEIGHT })
  })

  it('does not wrap long lines', () => {
    expect(layout('a very long line that goes on').lines).toHaveLength(1)
  })
})

describe('layoutText wrapping in a fixed-width box', () => {
  it('fills a line with as many words as fit', () => {
    const result = layout('aaa bbb ccc', { wrapWidth: 70 })
    expect(result.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 7],
      [8, 11]
    ])
    expect(result.width).toBe(70)
    expect(result.height).toBe(2 * LINE_HEIGHT)
  })

  it('lets the spaces at a wrap hang, so they neither count nor draw', () => {
    const result = layout('aaa bbb', { wrapWidth: 40 })
    expect(result.lines.map((line) => line.width)).toEqual([30, 30])
    expect(clustersOf(result, 0)).toEqual([0, 1, 2])
    expect(clustersOf(result, 1)).toEqual([4, 5, 6])
  })

  it('fits a word that is exactly as wide as the box', () => {
    expect(layout('abcd efgh', { wrapWidth: 40 }).lines).toHaveLength(2)
  })

  it('breaks a word wider than the box between characters', () => {
    const result = layout('abcdefgh', { wrapWidth: 30 })
    expect(result.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 3],
      [3, 6],
      [6, 8]
    ])
  })

  it('never splits a character from its combining mark when breaking a long word', () => {
    const text = `ae${String.fromCodePoint(0x301)}b`
    const result = layout(text, { wrapWidth: 20 })
    expect(result.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 1],
      [1, 3],
      [3, 4]
    ])
  })

  it('puts a word wider than the box on its own line after the words before it', () => {
    const result = layout('ab cdefghij', { wrapWidth: 50 })
    expect(result.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 2],
      [3, 8],
      [8, 11]
    ])
  })

  it('wraps each paragraph separately', () => {
    const result = layout('aaa bbb\nccc', { wrapWidth: 40 })
    expect(result.lines.map((line) => [line.start, line.end])).toEqual([
      [0, 3],
      [4, 7],
      [8, 11]
    ])
  })

  it('keeps the box as wide as asked even when text is narrower', () => {
    expect(layout('ab', { wrapWidth: 100 }).width).toBe(100)
  })
})

describe('layoutText line height', () => {
  it('spaces lines by the line height times the font size', () => {
    const result = layout('a\nb\nc', { lineHeight: 2 })
    expect(result.lines.map((line) => line.top)).toEqual([0, 40, 80])
    expect(result.lineHeight).toBe(40)
    expect(result.height).toBe(120)
  })

  it('places each baseline as CSS centres the font in a line of that height', () => {
    const result = layout('a\nb', { lineHeight: 1.5 })
    expect(result.lines.map((line) => line.baselineY)).toEqual([
      getTextBaselineOffset(0, FONT_SIZE, 1.5, 16, 4),
      getTextBaselineOffset(1, FONT_SIZE, 1.5, 16, 4)
    ])
  })

  it('moves the glyphs with their baseline', () => {
    const tight = layout('a', { lineHeight: 1 }).lines[0]?.glyphs[0]?.y ?? 0
    const loose = layout('a', { lineHeight: 2 }).lines[0]?.glyphs[0]?.y ?? 0
    expect(loose - tight).toBe(10)
  })

  it('breaks the same lines whatever the line height', () => {
    const wrapped = (lineHeight: number) =>
      layout('aaaa bbbb', { wrapWidth: 50, lineHeight }).lines.map((line) => [line.start, line.end])
    expect(wrapped(3)).toEqual(wrapped(1))
  })
})

describe('layoutText alignment', () => {
  const xOf = (alignment: TextAlign, options: Partial<TextLayoutInput> = {}) =>
    layout('aaaa\naa', { alignment, ...options }).lines.map((line) => [line.x, line.glyphs[0]?.x])

  it('starts lines at the left edge by default', () => {
    expect(xOf('left')).toEqual([
      [0, 0],
      [0, 0]
    ])
  })

  it('centres each line in the widest line when the box fits its text', () => {
    expect(xOf('center')).toEqual([
      [0, 0],
      [10, 10]
    ])
  })

  it('pushes each line to the right edge', () => {
    expect(xOf('right')).toEqual([
      [0, 0],
      [20, 20]
    ])
  })

  it('aligns inside a fixed-width box', () => {
    expect(xOf('center', { wrapWidth: 100 })).toEqual([
      [30, 30],
      [40, 40]
    ])
    expect(xOf('right', { wrapWidth: 100 })).toEqual([
      [60, 60],
      [80, 80]
    ])
  })

  it('aligns a wrapped line by the width without its hanging space', () => {
    const result = layout('aa bb cc', { alignment: 'right', wrapWidth: 45 })
    expect(result.lines.map((line) => line.x)).toEqual([25, 25, 25])
  })
})

describe('layoutText with right to left and mixed text', () => {
  it('reads a Hebrew paragraph right to left, so its first character is rightmost', () => {
    const result = layout('אבג')
    expect(result.lines[0]?.direction).toBe('rtl')
    expect(clustersOf(result, 0)).toEqual([2, 1, 0])
  })

  it('keeps left alignment left for right to left text, since alignment is physical', () => {
    const result = layout('אבג', { alignment: 'left', wrapWidth: 100 })
    expect(result.lines[0]?.x).toBe(0)
  })

  it('orders a right to left word inside a left to right line', () => {
    const result = layout('ab אבג cd')
    expect(clustersOf(result, 0)).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8])
    expect(result.lines[0]?.glyphs.map((glyph) => glyph.x)).toEqual(
      Array.from({ length: 9 }, (_, index) => index * CHARACTER_WIDTH)
    )
  })

  it('reverses the order of words in a right to left paragraph', () => {
    const result = layout('אב גד')
    expect(clustersOf(result, 0)).toEqual([4, 3, 2, 1, 0])
  })

  it('keeps digits in reading order inside right to left text', () => {
    const result = layout('אב 12')
    expect(clustersOf(result, 0)).toEqual([3, 4, 2, 1, 0])
  })

  it('wraps a right to left paragraph into lines that each read right to left', () => {
    const result = layout('אבג דהו', { wrapWidth: 40 })
    expect(result.lines.map((line) => clustersOf(result, result.lines.indexOf(line)))).toEqual([
      [2, 1, 0],
      [6, 5, 4]
    ])
  })
})

describe('layoutText with the bundled fonts', () => {
  const text = 'Hello مرحبا world'
  const input: TextLayoutInput = {
    text,
    fontSize: 20,
    alignment: 'left',
    lineHeight: 1.2,
    wrapWidth: undefined
  }
  let shaper: TextShaper
  let result: ReturnType<typeof layoutText>

  const glyphsOf = (fontId: string) =>
    result.lines[0]?.glyphs.filter((glyph) => glyph.fontId === fontId) ?? []
  const xOfCluster = (cluster: number) =>
    result.lines[0]?.glyphs.find((glyph) => glyph.cluster === cluster)?.x ?? Number.NaN

  beforeAll(async () => {
    const registry = createFontRegistry({
      catalog: BUNDLED_FONT_CATALOG,
      loadBytes: readBundledFontBytes,
      createShapingFont: createHarfBuzzShapingFont
    })
    await registry.loadFontsForText(text)
    shaper = createTextShaper(registry)
    result = layoutText(input, shaper)
  })

  it('draws each script in its own font, Latin around the Arabic', () => {
    const fontIds = result.lines[0]?.glyphs.map((glyph) => glyph.fontId) ?? []
    expect([fontIds[0], fontIds.at(-1)]).toEqual(['inter', 'inter'])
    expect(glyphsOf('noto-sans-arabic').length).toBeGreaterThan(0)
  })

  it('reads the Arabic word right to left inside the left to right line', () => {
    const clusters = glyphsOf('noto-sans-arabic').map((glyph) => glyph.cluster)
    // The word starts at offset 6; its last letter is drawn first, leftmost.
    expect(Math.min(...clusters)).toBe(6)
    expect(clusters[0]).toBeGreaterThan(Math.min(...clusters))
  })

  it('keeps the blocks in order: Hello, then the Arabic word, then world', () => {
    // Marks such as Arabic dots hang back from their letter, so blocks are compared, not glyphs.
    const arabicXs = glyphsOf('noto-sans-arabic').map((glyph) => glyph.x)
    expect(Math.min(...arabicXs)).toBeGreaterThan(xOfCluster(4))
    expect(Math.max(...arabicXs)).toBeLessThan(xOfCluster(12))
  })

  it('is as wide as its glyph advances add up to, with no gap where fonts change', () => {
    const lastAdvance = shaper
      .shapeRuns('d', 'ltr')
      .reduce((sum, run) => sum + (run.glyphs[0]?.xAdvance ?? 0) * (20 / run.unitsPerEm), 0)
    expect(xOfCluster(text.length - 1) + lastAdvance).toBeCloseTo(result.width)
    expect(result.lines[0]?.width).toBeCloseTo(result.width)
    expect(result.height).toBe(20 * 1.2)
  })

  it('wraps mixed text and keeps the Arabic word in one piece', () => {
    const wrapped = layoutText({ ...input, wrapWidth: 70 }, shaper)
    expect(wrapped.lines.length).toBeGreaterThan(1)
    const arabicLines = wrapped.lines.filter((line) =>
      line.glyphs.some((glyph) => glyph.fontId === 'noto-sans-arabic')
    )
    expect(arabicLines).toHaveLength(1)
  })
})
