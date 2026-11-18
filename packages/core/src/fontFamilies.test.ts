import { describe, expect, it } from 'vitest'
import { listFontCandidates, parseFontFamilyList, withFontSubstitutes } from './fontFamilies.ts'

describe('parseFontFamilyList', () => {
  it('splits on commas, trims and drops quotes', () => {
    expect(parseFontFamilyList(`Inter, "Noto Sans Arabic" , 'Helvetica Neue',sans-serif`)).toEqual([
      'Inter',
      'Noto Sans Arabic',
      'Helvetica Neue',
      'sans-serif'
    ])
  })

  it('has nothing for an empty list', () => {
    expect(parseFontFamilyList('  ')).toEqual([])
  })
})

describe('withFontSubstitutes', () => {
  it('puts the stand-in right after the font it replaces', () => {
    expect(withFontSubstitutes('Georgia, serif')).toBe('Georgia, Gelasio, serif')
  })

  it('reads a quoted name in any case', () => {
    expect(withFontSubstitutes(`'times new roman'`)).toBe(`'times new roman', Tinos`)
  })

  it('leaves a list alone when it already names the stand-in, or names nothing with one', () => {
    expect(withFontSubstitutes('Georgia, Gelasio, serif')).toBe('Georgia, Gelasio, serif')
    expect(withFontSubstitutes('Lora, serif')).toBe('Lora, serif')
  })
})

describe('listFontCandidates', () => {
  it('keeps the named family first, then the fallbacks', () => {
    expect(listFontCandidates('Lora')).toEqual([
      'Lora',
      'Inter',
      'Noto Sans Arabic',
      'Noto Sans Hebrew',
      'Noto Sans Devanagari',
      'Noto Sans Symbols',
      'Noto Sans Symbols 2'
    ])
  })

  it('looks up the stand-in for a font the API cannot have, and a family for a generic name', () => {
    expect(listFontCandidates('Georgia, monospace').slice(0, 2)).toEqual(['Gelasio', 'Cousine'])
  })

  it('names each family once whatever its case, and skips generic names with no family', () => {
    expect(listFontCandidates('inter, system-ui, cursive').slice(0, 2)).toEqual([
      'inter',
      'Noto Sans Arabic'
    ])
  })
})
