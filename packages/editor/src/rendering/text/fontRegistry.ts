import type {
  CodePointRange,
  FontCatalog,
  FontCatalogData,
  FontDefinition,
  FontRegistry,
  FontRegistryOptions,
  FontRun,
  ShapingFont
} from './types.ts'

const HEX_RADIX = 16
const RANGE_PATTERN = /^u\+([\da-f]+)(?:-([\da-f]+))?$/i

const parseCodePointRange = (text: string): CodePointRange => {
  const match = RANGE_PATTERN.exec(text)
  if (!match?.[1]) throw new Error(`Not a code point range: ${text}`)
  const first = Number.parseInt(match[1], HEX_RADIX)
  return [first, match[2] ? Number.parseInt(match[2], HEX_RADIX) : first]
}

/**
 * Turns the catalog data, where ranges read like `U+0600-06FF`, into numbers once, so looking up
 * a character's font does no parsing.
 * @param data - The catalog as written.
 * @returns The catalog with numeric ranges.
 */
export const compileFontCatalog = (data: FontCatalogData): FontCatalog => ({
  defaultFontId: data.defaultFontId,
  fonts: data.fonts.map((font) => ({ ...font, coverage: font.coverage.map(parseCodePointRange) }))
})

const isInRange = (codePoint: number, [first, last]: CodePointRange): boolean =>
  codePoint >= first && codePoint <= last

const coversCodePoint = (font: FontDefinition, codePoint: number): boolean =>
  font.coverage.some((range) => isInRange(codePoint, range))

const findDefinition = (catalog: FontCatalog, fontId: string): FontDefinition | undefined =>
  catalog.fonts.find((font) => font.id === fontId)

/**
 * Chooses the font that draws a character. The current font keeps it when it can, so spaces,
 * digits and punctuation stay with the letters around them and a run is not split at every
 * neutral character; otherwise the first font in the catalog that covers it takes over.
 * @param catalog - The fonts available.
 * @param codePoint - The character.
 * @param currentFontId - The font of the character before, if any.
 * @returns The font's id; the default font when nothing covers the character, so it draws as
 * a missing-glyph box rather than vanishing.
 */
export const findFontForCodePoint = (
  catalog: FontCatalog,
  codePoint: number,
  currentFontId: string | undefined
): string => {
  const current = currentFontId === undefined ? undefined : findDefinition(catalog, currentFontId)
  if (current && coversCodePoint(current, codePoint)) return current.id
  return catalog.fonts.find((font) => coversCodePoint(font, codePoint))?.id ?? catalog.defaultFontId
}

/**
 * Splits a string into the stretches each font draws. Fonts are chosen by coverage, per
 * character, so one line can mix Latin, Hebrew and Devanagari.
 * @param text - The string.
 * @param catalog - The fonts available.
 * @returns Runs that cover the whole string in order, as UTF-16 offsets; none for an empty string.
 */
export const splitIntoFontRuns = (text: string, catalog: FontCatalog): FontRun[] =>
  [...text].reduce<FontRun[]>((runs, character) => {
    const lastRun = runs.at(-1)
    const fontId = findFontForCodePoint(catalog, character.codePointAt(0) ?? 0, lastRun?.fontId)
    const start = lastRun?.end ?? 0
    const end = start + character.length
    return lastRun && lastRun.fontId === fontId
      ? [...runs.slice(0, -1), { ...lastRun, end }]
      : [...runs, { fontId, start, end }]
  }, [])

/**
 * Keeps the fonts that are loaded or loading. Fonts load on demand, once, and are shared by
 * every text, so a script's file is fetched only when someone types in that script.
 * @param options - The catalog, and how to read a font file and open it in HarfBuzz.
 * @returns The registry.
 */
export const createFontRegistry = ({
  catalog,
  loadBytes,
  createShapingFont
}: FontRegistryOptions): FontRegistry => {
  const loadedFonts = new Map<string, ShapingFont>()
  const loadingFonts = new Map<string, Promise<void>>()

  const loadFont = (fontId: string): Promise<void> => {
    const definition = findDefinition(catalog, fontId)
    if (!definition) return Promise.reject(new Error(`Unknown font ${fontId}`))
    if (loadedFonts.has(fontId)) return Promise.resolve()
    const pending = loadingFonts.get(fontId)
    if (pending) return pending

    const loading = loadBytes(definition.url)
      .then(createShapingFont)
      .then((font) => {
        loadedFonts.set(fontId, font)
      })
      .finally(() => {
        // Forgotten on failure too, so a dropped connection is retried rather than cached.
        loadingFonts.delete(fontId)
      })
    loadingFonts.set(fontId, loading)
    return loading
  }

  const loadFontsForText = async (text: string): Promise<void> => {
    const neededIds = new Set([
      catalog.defaultFontId,
      ...splitIntoFontRuns(text, catalog).map((run) => run.fontId)
    ])
    await Promise.all([...neededIds].map(loadFont))
  }

  return { catalog, loadFontsForText, getFont: (fontId) => loadedFonts.get(fontId) }
}
