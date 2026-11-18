/** The family text falls back to when its own list names nothing the font API has. */
export const DEFAULT_FONT_FAMILY = 'Inter'

/**
 * Families tried after a text's own list, in order, for the characters its fonts lack: the default
 * for Latin, Greek and Cyrillic, then the scripts it does not cover, then arrows and symbols.
 */
export const FALLBACK_FONT_FAMILIES: readonly string[] = [
  DEFAULT_FONT_FAMILY,
  'Noto Sans Arabic',
  'Noto Sans Hebrew',
  'Noto Sans Devanagari',
  'Noto Sans Symbols',
  'Noto Sans Symbols 2'
]

/**
 * Fonts the font API cannot serve, because their makers do not allow it, each with an open font
 * that has the same letter widths. A line breaks in the same place whichever of the two draws it.
 */
export const FONT_SUBSTITUTES: Readonly<Record<string, string>> = {
  arial: 'Arimo',
  calibri: 'Carlito',
  cambria: 'Caladea',
  courier: 'Cousine',
  'courier new': 'Cousine',
  georgia: 'Gelasio',
  helvetica: 'Arimo',
  'helvetica neue': 'Arimo',
  times: 'Tinos',
  'times new roman': 'Tinos'
}

/** The CSS generic families, each with the family that draws it. */
export const GENERIC_FONT_FAMILIES: Readonly<Record<string, string>> = {
  '-apple-system': DEFAULT_FONT_FAMILY,
  monospace: 'Cousine',
  'sans-serif': DEFAULT_FONT_FAMILY,
  serif: 'Gelasio',
  'system-ui': DEFAULT_FONT_FAMILY,
  'ui-monospace': 'Cousine',
  'ui-sans-serif': DEFAULT_FONT_FAMILY,
  'ui-serif': 'Gelasio'
}

// Generic names with no family of their own: looking them up would only ask the API for nothing.
const UNMAPPED_GENERIC_FAMILIES = new Set(['cursive', 'emoji', 'fangsong', 'fantasy', 'math'])

const FAMILY_SEPARATOR = ','
const QUOTES_PATTERN = /^["']|["']$/g

const normalizeFamily = (family: string): string =>
  family.trim().replaceAll(QUOTES_PATTERN, '').toLowerCase()

/**
 * Reads a CSS `font-family` list.
 * @param list - A list such as `Inter, "Noto Sans", sans-serif`.
 * @returns The family names in order, without quotes or padding.
 */
export const parseFontFamilyList = (list: string): string[] =>
  list
    .split(FAMILY_SEPARATOR)
    .map((family) => family.trim().replaceAll(QUOTES_PATTERN, ''))
    .filter((family) => family !== '')

/**
 * Puts the stand-in for a font right after it in a CSS `font-family` list, for a renderer that
 * matches families by name. A list that already names the stand-in, or names no font with one,
 * comes back as it was.
 * @param list - A `font-family` list such as `Georgia, serif`.
 * @returns The list with each stand-in after the font it replaces, such as `Georgia, Gelasio, serif`.
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

const expandFamily = (family: string): string[] => {
  const name = normalizeFamily(family)
  if (UNMAPPED_GENERIC_FAMILIES.has(name)) return []
  const generic = GENERIC_FONT_FAMILIES[name]
  if (generic !== undefined) return [generic]
  const substitute = FONT_SUBSTITUTES[name]
  return [substitute ?? family]
}

/**
 * Lists the families to look up for a text, in the order they are preferred: each family the
 * node names, a font the API cannot have replaced by its stand-in and a generic name by a real
 * family, then the fallbacks. The first one the font API has draws the text; the others draw what it lacks.
 * @param list - The node's `fontFamily`.
 * @returns Family names, each once whatever its case.
 */
export const listFontCandidates = (list: string): string[] =>
  [...parseFontFamilyList(list).flatMap(expandFamily), ...FALLBACK_FONT_FAMILIES].filter(
    (family, index, families) =>
      families.findIndex((other) => other.toLowerCase() === family.toLowerCase()) === index
  )
