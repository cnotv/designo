import { isInCodePointRanges, isNeutralCharacter, parseCodePointRange } from '@designo/fonts'
import type {
  FontCatalog,
  FontCatalogData,
  FontDefinition,
  FontRegistry,
  FontRegistryOptions,
  FontRun,
  FontStore,
  FontStoreOptions,
  GetLoadedFont,
  ShapingFont
} from './types.ts'

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

// A font file's ranges say what it was cut to cover, not what it draws: a subset may leave out a
// character its range names. Once the file has loaded its own glyphs decide; until then the range.
const coversCodePoint = (
  font: FontDefinition,
  codePoint: number,
  getFont: GetLoadedFont
): boolean =>
  isInCodePointRanges(font.coverage, codePoint) && (getFont(font.id)?.hasGlyph(codePoint) ?? true)

const NO_LOADED_FONTS: GetLoadedFont = () => undefined

/**
 * Says whether any font in the catalog draws a character.
 * @param catalog - The fonts available.
 * @param codePoint - The character.
 * @param getFont - The loaded fonts, whose glyphs overrule their ranges; none by default.
 * @returns False for emoji and anything else the catalog's fonts leave out.
 */
export const isCodePointCovered = (
  catalog: FontCatalog,
  codePoint: number,
  getFont: GetLoadedFont = NO_LOADED_FONTS
): boolean => catalog.fonts.some((font) => coversCodePoint(font, codePoint, getFont))

const findDefinition = (catalog: FontCatalog, fontId: string): FontDefinition | undefined =>
  catalog.fonts.find((font) => font.id === fontId)

/**
 * Chooses the font that draws a character. The current font keeps a space, digit or punctuation
 * mark when it can, so they stay with the letters around them and a run is not split at every
 * one; a letter, and anything the current font lacks, goes to the first font that covers it.
 * @param catalog - The fonts available.
 * @param codePoint - The character.
 * @param currentFontId - The font of the character before, if any.
 * @param getFont - The loaded fonts, whose glyphs overrule their ranges; none by default.
 * @returns The font's id; the default font when nothing covers the character, so it draws as
 * a missing-glyph box rather than vanishing.
 */
export const findFontForCodePoint = (
  catalog: FontCatalog,
  codePoint: number,
  currentFontId: string | undefined,
  getFont: GetLoadedFont = NO_LOADED_FONTS
): string => {
  const current = currentFontId === undefined ? undefined : findDefinition(catalog, currentFontId)
  const isNeutral = isNeutralCharacter(String.fromCodePoint(codePoint))
  if (current && isNeutral && coversCodePoint(current, codePoint, getFont)) return current.id
  return (
    catalog.fonts.find((font) => coversCodePoint(font, codePoint, getFont))?.id ??
    catalog.defaultFontId
  )
}

/**
 * Splits a string into the stretches each font draws. Fonts are chosen by coverage, per
 * character, so one line can mix Latin, Hebrew and Devanagari.
 * @param text - The string.
 * @param catalog - The fonts available.
 * @param getFont - The loaded fonts, whose glyphs overrule their ranges; none by default.
 * @returns Runs that cover the whole string in order, as UTF-16 offsets; none for an empty string.
 */
export const splitIntoFontRuns = (
  text: string,
  catalog: FontCatalog,
  getFont: GetLoadedFont = NO_LOADED_FONTS
): FontRun[] =>
  [...text].reduce<FontRun[]>((runs, character) => {
    const lastRun = runs.at(-1)
    const fontId = findFontForCodePoint(
      catalog,
      character.codePointAt(0) ?? 0,
      lastRun?.fontId,
      getFont
    )
    const start = lastRun?.end ?? 0
    const end = start + character.length
    return lastRun && lastRun.fontId === fontId
      ? [...runs.slice(0, -1), { ...lastRun, end }]
      : [...runs, { fontId, start, end }]
  }, [])

/**
 * Keeps the font files that are loaded or loading. Files load on demand, once, and are shared by
 * every text, so a script's file is fetched only when someone types in that script.
 * @param options - How to read a font file and open it in HarfBuzz.
 * @returns The store.
 */
export const createFontStore = ({
  loadBytes,
  createShapingFont,
  onFontLoaded
}: FontStoreOptions): FontStore => {
  const loadedFonts = new Map<string, ShapingFont>()
  const loadedBytes = new Map<string, Uint8Array>()
  const loadingFonts = new Map<string, Promise<void>>()

  const loadFont = (definition: FontDefinition): Promise<void> => {
    if (loadedFonts.has(definition.id)) return Promise.resolve()
    const pending = loadingFonts.get(definition.id)
    if (pending) return pending
    const loading = loadBytes(definition.url)
      .then(async (bytes) => {
        loadedFonts.set(definition.id, await createShapingFont(bytes))
        loadedBytes.set(definition.id, bytes)
        onFontLoaded?.(definition, bytes)
      })
      .finally(() => {
        // Forgotten on failure too, so a dropped connection is retried rather than cached.
        loadingFonts.delete(definition.id)
      })
    loadingFonts.set(definition.id, loading)
    return loading
  }

  return {
    loadFont,
    getFont: (fontId) => loadedFonts.get(fontId),
    getFontBytes: (fontId) => loadedBytes.get(fontId)
  }
}

/**
 * Puts a catalog over the shared store: the fonts one family list draws with, preferred first.
 * @param options - The catalog, and the store that loads its files.
 * @returns The registry.
 */
export const createFontRegistry = ({ catalog, store }: FontRegistryOptions): FontRegistry => {
  const loadFont = (fontId: string): Promise<void> => {
    const definition = findDefinition(catalog, fontId)
    return definition
      ? store.loadFont(definition)
      : Promise.reject(new Error(`Unknown font ${fontId}`))
  }

  // Each round loads the fonts the ranges point to; a font that lacks a glyph its range names
  // passes the character on, which can need another font, so the rounds go on until none is missing.
  // Every round loads at least one font, so they end within the catalog's size.
  const loadFontsForText = async (text: string): Promise<void> => {
    const neededIds = new Set([
      catalog.defaultFontId,
      ...splitIntoFontRuns(text, catalog, store.getFont).map((run) => run.fontId)
    ])
    const missingIds = [...neededIds].filter((fontId) => !store.getFont(fontId))
    if (missingIds.length === 0) return
    await Promise.all(missingIds.map(loadFont))
    await loadFontsForText(text)
  }

  return { catalog, loadFontsForText, loadFont, getFont: store.getFont }
}
