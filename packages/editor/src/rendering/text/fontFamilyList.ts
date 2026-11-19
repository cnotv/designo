import { toFontsourceId, type CodePointRange } from '@designo/fonts'
import type { FontDefinition, FontRegistry } from '@designo/text'

const HEX_RADIX = 16
const DEFAULT_FONT_WEIGHT = 400

/**
 * Names the CSS family a loaded font file is registered under for the browser, which no other
 * style in the app uses, so a font installed on the visitor's machine never stands in for it.
 * @param family - The font's family name, such as `Noto Sans Arabic`.
 * @returns The `FontFace` family name, such as `designo-noto-sans-arabic`.
 */
export const getLoadedFontCssFamily = (family: string): string =>
  `designo-${toFontsourceId(family)}`

const formatCodePoint = (codePoint: number): string =>
  codePoint.toString(HEX_RADIX).toUpperCase().padStart(4, '0')

const formatRange = ([first, last]: CodePointRange): string =>
  first === last
    ? `U+${formatCodePoint(first)}`
    : `U+${formatCodePoint(first)}-${formatCodePoint(last)}`

/**
 * Writes a font's coverage the way CSS reads it, so the browser uses the file for those
 * characters only, as the shaper does.
 * @param definition - The font file.
 * @returns A `unicode-range` value such as `U+0000-00FF, U+0131`.
 */
export const toUnicodeRange = (definition: FontDefinition): string =>
  definition.coverage.map(formatRange).join(', ')

/**
 * Builds the CSS font list for text the browser draws itself (the editing box and the Canvas 2D
 * fallback) so it looks like the shaped text: the list's fonts as the shaper chose them, preferred
 * first, and last the node's own list, for what they cannot draw or while they load.
 * @param list - The node's `fontFamily`.
 * @param registry - The fonts the shaper uses for that list, once the library has found them.
 * @returns A list for CSS or a canvas font string.
 */
export const createBrowserFontStack = (
  list: string,
  registry: FontRegistry | undefined
): string => {
  const families = [...new Set(registry?.catalog.fonts.map((font) => font.family) ?? [])]
  return [...families.map((family) => `'${getLoadedFontCssFamily(family)}'`), list].join(', ')
}

/**
 * Registers a loaded font file with the browser, so the paths that draw text with the browser
 * use the same file the shaper does.
 * @param definition - The font file.
 * @param bytes - Its bytes, as the shaper received them.
 */
export const addBrowserFontFace = (definition: FontDefinition, bytes: Uint8Array): void => {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return
  // A copy, as FontFace takes only bytes backed by a plain ArrayBuffer.
  const face = new FontFace(getLoadedFontCssFamily(definition.family), new Uint8Array(bytes), {
    unicodeRange: toUnicodeRange(definition),
    weight: String(definition.fontWeight ?? DEFAULT_FONT_WEIGHT),
    style: definition.fontStyle ?? 'normal'
  })
  document.fonts.add(face)
  void face.load()
}
