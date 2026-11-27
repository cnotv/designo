import { describe, expect, it } from 'vitest'
import { hexToCmyk } from './cmyk.ts'

describe('hexToCmyk', () => {
  it('turns black into black ink alone and white into no ink', () => {
    expect(hexToCmyk('#000000')).toEqual([0, 0, 0, 100])
    expect(hexToCmyk('#ffffff')).toEqual([0, 0, 0, 0])
  })

  it('turns each primary into the two inks that make it', () => {
    expect(hexToCmyk('#ff0000')).toEqual([0, 100, 100, 0])
    expect(hexToCmyk('#00ff00')).toEqual([100, 0, 100, 0])
    expect(hexToCmyk('#0000ff')).toEqual([100, 100, 0, 0])
  })

  it('takes the grey of a colour into black and rounds to a tenth of a percent', () => {
    expect(hexToCmyk('#808080')).toEqual([0, 0, 0, 49.8])
    expect(hexToCmyk('#336699')).toEqual([66.7, 33.3, 0, 40])
  })

  it('ignores the alpha after the colour', () => {
    expect(hexToCmyk('#ff000080')).toEqual([0, 100, 100, 0])
  })
})
