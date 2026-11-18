import { withFontSubstitutes } from '@designo/core'
import type { FontCatalog } from './types.ts'

const QUOTES_PATTERN = /^["']|["']$/g

/**
 * Reads a CSS `font-family` list.
 * @param list - A list such as `Inter, "Noto Sans", sans-serif`.
 * @returns The family names in order, without quotes or padding.
 */
export const parseFontFamilyList = (list: string): string[] =>
  list
    .split(',')
    .map((family) => family.trim().replaceAll(QUOTES_PATTERN, ''))
    .filter((family) => family !== '')

/**
 * Chooses the font a node's text is shaped with. The first family in the list that the catalog
 * has wins; a list that names none uses the bundled Inter, because the editor cannot read the
 * font files of the user's system.
 * @param list - The node's `fontFamily`.
 * @param catalog - The fonts the editor ships.
 * @returns The id of a catalog font.
 */
export const pickPrimaryFontId = (list: string, catalog: FontCatalog): string => {
  const names = parseFontFamilyList(withFontSubstitutes(list)).map((family) => family.toLowerCase())
  const named = names
    .map((name) => catalog.fonts.find((font) => font.family.toLowerCase() === name))
    .find((font) => font !== undefined)
  return named?.id ?? catalog.defaultFontId
}

/**
 * Names the CSS family a bundled font is loaded under, which no other style in the app uses.
 * @param fontId - The catalog id of the font.
 * @returns The `@font-face` family name.
 */
export const getBundledFontCssFamily = (fontId: string): string => `designo-${fontId}`

/**
 * Builds the CSS font list for text the browser draws itself (the editing box and the Canvas 2D
 * fallback) so it looks like the shaped text: the primary font first, then the other bundled
 * fonts, which a character the primary lacks falls through to as the shaper's font choice does,
 * and last the node's own list, for what the bundled fonts cannot draw.
 * @param list - The node's `fontFamily`.
 * @param catalog - The fonts the editor ships.
 * @returns A list for CSS or a canvas font string.
 */
export const createBrowserFontStack = (list: string, catalog: FontCatalog): string => {
  const primaryId = pickPrimaryFontId(list, catalog)
  const bundledIds = [primaryId, ...catalog.fonts.map((font) => font.id)]
  const bundledFamilies = [...new Set(bundledIds)].map(
    (fontId) => `'${getBundledFontCssFamily(fontId)}'`
  )
  return [...bundledFamilies, list].join(', ')
}
