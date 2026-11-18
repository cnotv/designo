/**
 * Fonts Designo cannot ship, each with the bundled font that stands in for it. A stand-in has the
 * same letter widths, so a line breaks in the same place whichever of the two draws it.
 */
export const FONT_SUBSTITUTES: Readonly<Record<string, string>> = {
  georgia: 'Gelasio'
}

const FAMILY_SEPARATOR = ','
const QUOTES_PATTERN = /^["']|["']$/g

const normalizeFamily = (family: string): string =>
  family.trim().replaceAll(QUOTES_PATTERN, '').toLowerCase()

/**
 * Puts the stand-in for a font right after it in a CSS `font-family` list. The editor and the
 * screenshot renderer both read the result, so they pick the same font. A list that already names
 * the stand-in, or names no font with one, comes back as it was.
 * @param list - A `font-family` list such as `Georgia, serif`.
 * @returns The list with each stand-in added after the font it replaces, such as `Georgia, Gelasio, serif`.
 */
export const withFontSubstitutes = (list: string): string => {
  const families = list.split(FAMILY_SEPARATOR)
  const named = new Set(families.map(normalizeFamily))
  return families
    .flatMap((family) => {
      const substitute = FONT_SUBSTITUTES[normalizeFamily(family)]
      return substitute === undefined || named.has(substitute.toLowerCase())
        ? [family]
        : [family, ` ${substitute}`]
    })
    .join(FAMILY_SEPARATOR)
}
