import { describe, expect, it } from 'vitest'
import { getTextBaselineOffset } from './baseline.ts'

describe('getTextBaselineOffset', () => {
  it('centres the font in the line height, as CSS does', () => {
    // 20px text: a 25px line, 18 + 4 of font, so 1.5 above the ascent.
    expect(getTextBaselineOffset(0, 20, 1.25, 18, 4)).toBe(19.5)
  })

  it('steps one line height per line', () => {
    expect(getTextBaselineOffset(2, 20, 1.25, 18, 4)).toBe(69.5)
  })

  it('follows the line height: a taller line puts more space above the font', () => {
    // 20px text in a 40px line: 18 + 4 of font leaves 18 to split, so 9 above the ascent.
    expect(getTextBaselineOffset(0, 20, 2, 18, 4)).toBe(27)
    expect(getTextBaselineOffset(1, 20, 2, 18, 4)).toBe(67)
  })
})
