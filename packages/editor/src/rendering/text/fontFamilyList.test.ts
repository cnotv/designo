import { describe, expect, it } from 'vitest'
import { FIXTURE_FONT_CATALOG, createFixtureFontRegistry } from './fixtures/fontFiles.ts'
import { compileFontCatalog } from './fontRegistry.ts'
import { createBrowserFontStack, getLoadedFontCssFamily, toUnicodeRange } from './fontFamilyList.ts'

describe('getLoadedFontCssFamily', () => {
  it('names a family the way nothing else in the app does', () => {
    expect(getLoadedFontCssFamily('Noto Sans Arabic')).toBe('designo-noto-sans-arabic')
  })
})

describe('toUnicodeRange', () => {
  it('writes ranges and single code points the CSS way', () => {
    const [font] = compileFontCatalog({
      defaultFontId: 'a',
      fonts: [{ id: 'a', family: 'A', url: 'a.ttf', coverage: ['U+0000-00FF', 'U+0131'] }]
    }).fonts
    expect(font && toUnicodeRange(font)).toBe('U+0000-00FF, U+0131')
  })
})

describe('createBrowserFontStack', () => {
  it('lists the fonts the shaper uses, preferred first, then the node list', () => {
    expect(createBrowserFontStack('Inter, sans-serif', createFixtureFontRegistry())).toBe(
      `'designo-inter', 'designo-noto-sans-arabic', 'designo-noto-sans-hebrew', 'designo-noto-sans-devanagari', Inter, sans-serif`
    )
  })

  it('names each family once, however many subset files it has', () => {
    const catalog = compileFontCatalog({
      defaultFontId: 'gelasio:latin',
      fonts: [
        { id: 'gelasio:latin', family: 'Gelasio', url: 'a.ttf', coverage: ['U+0000-00FF'] },
        { id: 'gelasio:latin-ext', family: 'Gelasio', url: 'b.ttf', coverage: ['U+0100-024F'] }
      ]
    })
    expect(createBrowserFontStack('Georgia', createFixtureFontRegistry(catalog))).toBe(
      `'designo-gelasio', Georgia`
    )
  })

  it('is the node list alone while the fonts are still being found', () => {
    expect(createBrowserFontStack('Lora, serif', undefined)).toBe('Lora, serif')
    expect(FIXTURE_FONT_CATALOG.fonts.length).toBeGreaterThan(0)
  })
})
