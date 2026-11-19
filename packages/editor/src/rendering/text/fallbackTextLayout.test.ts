import { describe, expect, it } from 'vitest'
import { layoutFallbackText } from './fallbackTextLayout.ts'
import type { FallbackTextInput } from '@designo/text'

// Every character is 10 wide, as in the layout tests, so lines can be counted by eye.
const measureWidth = (text: string): number => text.length * 10

const lay = (text: string, overrides: Partial<FallbackTextInput> = {}) =>
  layoutFallbackText(
    {
      text,
      wrapWidth: undefined,
      alignment: 'left',
      fontSize: 20,
      lineHeight: 1.2,
      ascent: 16,
      descent: 4,
      ...overrides
    },
    measureWidth
  )

const linesOf = (text: string, overrides: Partial<FallbackTextInput> = {}) =>
  lay(text, overrides).lines.map((line) => line.text)

describe('layoutFallbackText', () => {
  it('keeps hard line breaks and sizes the box to the widest line', () => {
    const result = lay('ab\nabcd')
    expect(result.lines.map((line) => line.text)).toEqual(['ab', 'abcd'])
    expect(result.width).toBe(40)
    expect(result.height).toBeCloseTo(48)
  })

  it('has one empty line for empty text, as the layout does', () => {
    const result = lay('')
    expect(result.lines).toHaveLength(1)
    expect(result.width).toBe(0)
    expect(result.height).toBeCloseTo(24)
  })

  it('places each baseline the way CSS places a line box', () => {
    const [first, second] = lay('a\nb').lines
    // (24 - 16 - 4) / 2 above the ascent, then a line height per line.
    expect(first?.baselineY).toBeCloseTo(2 + 16)
    expect((second?.baselineY ?? 0) - (first?.baselineY ?? 0)).toBeCloseTo(24)
  })

  it('wraps at spaces when it has a width, as the layout does', () => {
    expect(linesOf('one two three', { wrapWidth: 80 })).toEqual(['one two', 'three'])
  })

  it('lets the spaces at a wrap hang, not count', () => {
    expect(linesOf('aaaa bbbb', { wrapWidth: 40 })).toEqual(['aaaa', 'bbbb'])
  })

  it('cuts a word wider than the box between characters', () => {
    expect(linesOf('abcdefghij', { wrapWidth: 40 })).toEqual(['abcd', 'efgh', 'ij'])
  })

  it('never wraps without a width', () => {
    expect(linesOf('one two three four')).toEqual(['one two three four'])
  })

  it('aligns lines inside the box: the wrap width, else the widest line', () => {
    const wrapped = lay('ab\nabcd', { wrapWidth: 100, alignment: 'right' })
    expect(wrapped.lines.map((line) => line.x)).toEqual([80, 60])
    const auto = lay('ab\nabcd', { alignment: 'center' })
    expect(auto.lines.map((line) => line.x)).toEqual([10, 0])
    expect(lay('ab', { alignment: 'left', wrapWidth: 100 }).lines[0]?.x).toBe(0)
  })

  it('reports the wrap width as the box width', () => {
    expect(lay('ab', { wrapWidth: 100 }).width).toBe(100)
  })

  it('measures a line without its hanging spaces', () => {
    expect(lay('aaaa bbbb', { wrapWidth: 40 }).lines[0]?.width).toBe(40)
  })
})
