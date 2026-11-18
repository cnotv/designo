import { describe, expect, it } from 'vitest'
import { BUNDLED_FONT_CATALOG } from './bundledFontCatalog.ts'
import { createBrowserFontStack, parseFontFamilyList, pickPrimaryFontId } from './fontFamilyList.ts'

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

describe('pickPrimaryFontId', () => {
  it('uses the default font for the usual list', () => {
    expect(pickPrimaryFontId('Inter, system-ui, sans-serif', BUNDLED_FONT_CATALOG)).toBe('inter')
  })

  it('uses the default font when the list names nothing the registry has', () => {
    expect(pickPrimaryFontId('Comic Sans MS, cursive', BUNDLED_FONT_CATALOG)).toBe('inter')
  })

  it('uses the first listed family the registry has, whatever the case', () => {
    expect(pickPrimaryFontId('Papyrus, noto sans hebrew, Inter', BUNDLED_FONT_CATALOG)).toBe(
      'noto-sans-hebrew'
    )
  })
})

describe('createBrowserFontStack', () => {
  it('lists the bundled fonts with the primary first, then the node list', () => {
    expect(createBrowserFontStack('Inter, system-ui, sans-serif', BUNDLED_FONT_CATALOG)).toBe(
      `'designo-inter', 'designo-noto-sans-arabic', 'designo-noto-sans-hebrew', 'designo-noto-sans-devanagari', Inter, system-ui, sans-serif`
    )
  })

  it('puts the font a list names first', () => {
    expect(
      createBrowserFontStack('Noto Sans Hebrew, serif', BUNDLED_FONT_CATALOG).startsWith(
        `'designo-noto-sans-hebrew', 'designo-inter'`
      )
    ).toBe(true)
  })
})
