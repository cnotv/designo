export type TextDirection = 'ltr' | 'rtl'

/** An inclusive range of Unicode code points. */
export type CodePointRange = readonly [first: number, last: number]

/** One font file the editor can shape with. */
export interface FontDefinitionData {
  id: string
  /** The CSS family name the font answers to. */
  family: string
  /** Where the file is served from, relative to the app's base URL. */
  url: string
  /** The code points the file draws, as `U+0600-06FF` ranges or a single `U+00A0`. */
  coverage: readonly string[]
}

/** The catalog as written in the data file, with ranges still as text. */
export interface FontCatalogData {
  defaultFontId: string
  fonts: readonly FontDefinitionData[]
}

/** A font file with the code points it draws as numbers. */
export interface FontDefinition extends Omit<FontDefinitionData, 'coverage'> {
  coverage: readonly CodePointRange[]
}

/** The fonts text can be shaped with. The default covers Latin, Greek and Cyrillic. */
export interface FontCatalog {
  defaultFontId: string
  fonts: readonly FontDefinition[]
}

/** A stretch of a string drawn from one font, as UTF-16 offsets. */
export interface FontRun {
  fontId: string
  start: number
  end: number
}

/** Where a glyph goes, in font units; HarfBuzz keeps y pointing up. */
export interface ShapedGlyph {
  glyphId: number
  /** UTF-16 offset in the shaped string of the first character this glyph stands for. */
  cluster: number
  xAdvance: number
  yAdvance: number
  xOffset: number
  yOffset: number
}

/** A stretch of text shaped with one font; glyphs are in visual order, left to right. */
export interface ShapedRun {
  fontId: string
  direction: TextDirection
  unitsPerEm: number
  glyphs: readonly ShapedGlyph[]
}

/** The vertical metrics of a font, in font units. `descender` is negative, below the baseline. */
export interface FontLineMetrics {
  unitsPerEm: number
  ascender: number
  descender: number
}

export interface GlyphExtents {
  xBearing: number
  yBearing: number
  width: number
  height: number
}

/** A glyph's outline as SVG path data in font units, with y pointing up. */
export interface GlyphOutline {
  pathData: string
  extents: GlyphExtents | undefined
}

/** A font file opened in HarfBuzz. */
export interface ShapingFont {
  metrics: FontLineMetrics
  /** Shapes one string; the glyphs come back in visual order. */
  shape: (text: string, direction: TextDirection) => readonly ShapedGlyph[]
  hasGlyph: (codePoint: number) => boolean
  getGlyphOutline: (glyphId: number) => GlyphOutline
}

/** Reads a font file's bytes. The browser fetches it; tests read it from disk. */
export type FontBytesLoader = (url: string) => Promise<Uint8Array>

/** Opens font bytes in HarfBuzz. */
export type ShapingFontFactory = (bytes: Uint8Array) => Promise<ShapingFont>

export interface FontRegistryOptions {
  catalog: FontCatalog
  loadBytes: FontBytesLoader
  createShapingFont: ShapingFontFactory
}

export interface FontRegistry {
  catalog: FontCatalog
  /** Loads every font the text needs, and the default. Fonts load once and are shared. */
  loadFontsForText: (text: string) => Promise<void>
  /** The font once it has loaded; undefined while it is still being fetched. */
  getFont: (fontId: string) => ShapingFont | undefined
}

/** Shapes strings with whichever fonts the registry has loaded. */
export interface TextShaper {
  /**
   * Splits the text into fonts and shapes each stretch. Runs come back in visual order, so an
   * RTL string lists its last stretch first.
   */
  shapeRuns: (text: string, direction: TextDirection) => readonly ShapedRun[]
  /** The default font's metrics, which set the baseline of every line. */
  getPrimaryMetrics: () => FontLineMetrics
}
