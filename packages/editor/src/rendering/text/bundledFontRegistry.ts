import { BUNDLED_FONT_CATALOG } from './bundledFontCatalog.ts'
import { createFontRegistry } from './fontRegistry.ts'
import { fetchFontBytes } from './fetchFontBytes.ts'
import { createHarfBuzzShapingFont } from './harfBuzzFont.ts'
import type { FontRegistry } from './types.ts'

/**
 * Makes the registry the editor uses in the browser: the bundled fonts, fetched from the app's
 * origin and opened in HarfBuzz.
 * @returns A registry with no font loaded yet.
 */
export const createBundledFontRegistry = (): FontRegistry =>
  createFontRegistry({
    catalog: BUNDLED_FONT_CATALOG,
    loadBytes: fetchFontBytes,
    createShapingFont: createHarfBuzzShapingFont
  })
