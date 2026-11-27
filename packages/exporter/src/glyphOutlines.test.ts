import { describe, expect, it } from 'vitest'
import { groupGlyphOutlinesByFill, placeGlyphOutline } from './glyphOutlines.ts'

describe('placeGlyphOutline', () => {
  it('scales, flips and moves every point of an outline to the glyph origin', () => {
    const placed = placeGlyphOutline(
      { pathData: 'M0,0L1000,0Q500,700 0,0Z', x: 10, y: 20, scale: 0.01 },
      { x: 100, y: 200 }
    )
    expect(placed).toBe('M110,220L120,220Q115,213 110,220Z')
  })

  it('reads numbers with signs, decimals and exponents', () => {
    expect(
      placeGlyphOutline({ pathData: 'M-50 .5L1e3,-2.5Z', x: 0, y: 0, scale: 1 }, { x: 0, y: 0 })
    ).toBe('M-50,-0.5L1000,2.5Z')
  })
})

describe('groupGlyphOutlinesByFill', () => {
  it('joins the glyphs of one colour into one path and leaves out empty outlines', () => {
    const groups = groupGlyphOutlinesByFill(
      [
        { pathData: 'M0,0L1,0Z', x: 0, y: 10, scale: 1 },
        { pathData: '', x: 5, y: 10, scale: 1 },
        { pathData: 'M0,0L1,0Z', x: 10, y: 10, scale: 1, fill: '#ff0000' },
        { pathData: 'M0,0L1,0Z', x: 20, y: 10, scale: 1 }
      ],
      { x: 0, y: 0 }
    )
    expect([...groups]).toEqual([
      [undefined, 'M0,10L1,10ZM20,10L21,10Z'],
      ['#ff0000', 'M10,10L11,10Z']
    ])
  })
})
