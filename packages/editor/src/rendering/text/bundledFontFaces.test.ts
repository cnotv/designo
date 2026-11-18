import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { BUNDLED_FONT_CATALOG } from './bundledFontCatalog.ts'
import { getBundledFontCssFamily } from './fontFamilyList.ts'

describe('the bundled fonts in style.css', () => {
  it('declares an @font-face for every catalog font, under the family the browser font stack names, from the same file', async () => {
    const css = await readFile(new URL('../../style.css', import.meta.url), 'utf8')
    BUNDLED_FONT_CATALOG.fonts.forEach((font) => {
      expect(css).toContain(`font-family: '${getBundledFontCssFamily(font.id)}'`)
      expect(css).toContain(`url('/${font.url}')`)
    })
  })
})
