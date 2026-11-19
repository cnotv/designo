import type { DesignNode, FontStyle, TextAlign, TextFace } from '@designo/core'
import type { CodePointRange, ResolveFontFamily } from '@designo/fonts'

export type TextDirection = 'ltr' | 'rtl'

/** One font file the editor can shape with. */
export interface FontDefinitionData {
  /** Unique across families, such as `gelasio:latin`. */
  id: string
  /** The family name the font answers to. */
  family: string
  /** Where the file is fetched from. */
  url: string
  /** The code points the file draws, as `U+0600-06FF` ranges or a single `U+00A0`. */
  coverage: readonly string[]
  /** The weight the file is, which the browser's copy of it is registered with; 400 when unset. */
  fontWeight?: number
  /** The style the file is; normal when unset. */
  fontStyle?: FontStyle
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

/** The fonts a text can be shaped with, preferred first. The default sets the line metrics. */
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

/** Reads a font file's bytes. The browser fetches it from the font API; tests read it from disk. */
export type FontBytesLoader = (url: string) => Promise<Uint8Array>

/** The font once it has loaded; undefined while it is still being fetched. */
export type GetLoadedFont = (fontId: string) => ShapingFont | undefined

/** Opens font bytes in HarfBuzz. */
export type ShapingFontFactory = (bytes: Uint8Array) => Promise<ShapingFont>

export interface FontStoreOptions {
  loadBytes: FontBytesLoader
  createShapingFont: ShapingFontFactory
  /** Hears of each font once it has loaded, so the browser can draw with it too. */
  onFontLoaded?: (definition: FontDefinition, bytes: Uint8Array) => void
}

/** The font files loaded or loading, shared by every text so a file is fetched once. */
export interface FontStore {
  loadFont: (definition: FontDefinition) => Promise<void>
  /** The font once it has loaded; undefined while it is still being fetched. */
  getFont: (fontId: string) => ShapingFont | undefined
  /** The file a loaded font was read from, which a PDF embeds; undefined until it has loaded. */
  getFontBytes: (fontId: string) => Uint8Array | undefined
}

export interface FontRegistryOptions {
  catalog: FontCatalog
  store: FontStore
}

export interface FontRegistry {
  catalog: FontCatalog
  /** Loads every font the text needs, and the default. Fonts load once and are shared. */
  loadFontsForText: (text: string) => Promise<void>
  /** Loads one font by id, for a text whose family list names it. */
  loadFont: (fontId: string) => Promise<void>
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

/** The embedding level of every UTF-16 unit of a paragraph: even reads left to right, odd right to left. */
export interface BidiLevels {
  baseDirection: TextDirection
  levels: readonly number[]
}

/**
 * A stretch of a paragraph that stays on one line: a word, with the spaces after it. A line can
 * break after the spaces but not inside the word.
 */
export interface BreakChunk {
  start: number
  /** Where the trailing spaces begin; equals `end` when there are none. */
  contentEnd: number
  end: number
}

/** A chunk's widths, which is all that filling lines needs to know about it. */
export interface MeasuredWidths {
  contentWidth: number
  trailingWidth: number
}

export interface TextLayoutInput {
  text: string
  fontSize: number
  /** Extra space after every character, as a multiple of the font size. */
  letterSpacing: number
  alignment: TextAlign
  /** The distance between lines, as a multiple of the font size. */
  lineHeight: number
  /** The width of a fixed-width box to wrap in; undefined lets each line run as long as it is. */
  wrapWidth: number | undefined
}

/** One glyph to draw, placed in world units from the top left corner of the text box. */
export interface PlacedGlyph {
  fontId: string
  glyphId: number
  /** The glyph origin on its baseline, with the shaper's offsets applied. */
  x: number
  y: number
  /** UTF-16 offset in the whole text of the first character the glyph stands for. */
  cluster: number
  /** World units per font unit, to scale the glyph's outline. */
  scale: number
}

export interface LaidOutLine {
  glyphs: readonly PlacedGlyph[]
  /** Where the line's ink starts: the alignment's offset. */
  x: number
  /** The line's ink width, without the spaces that hang at a wrap. */
  width: number
  top: number
  baselineY: number
  /** The line's characters, as UTF-16 offsets in the text; a hard line break belongs to no line. */
  start: number
  end: number
  /** The paragraph's reading direction. */
  direction: TextDirection
}

export interface TextLayout {
  lines: readonly LaidOutLine[]
  /** The text box's size: the wrap width when there is one, else the widest line. */
  width: number
  height: number
  lineHeight: number
}

/** A rectangle of texels on one atlas page. */
export interface AtlasRectangle {
  x: number
  y: number
  width: number
  height: number
}

/** A row of the page that rectangles of up to `height` are packed along, left to right. */
export interface Shelf {
  y: number
  height: number
  usedWidth: number
}

export interface ShelfPackerState {
  pageWidth: number
  pageHeight: number
  shelves: readonly Shelf[]
  /** Where the next shelf would start: the page below the last one is still free. */
  nextShelfY: number
}

export interface PackResult {
  state: ShelfPackerState
  rectangle: AtlasRectangle
}

/** Names a glyph as the atlas stores it. */
export interface GlyphKey {
  fontId: string
  glyphId: number
  /** Device pixels per em rounded up to a power of two, from `bucketGlyphZoom`. */
  zoomBucket: number
}

/** A glyph drawn into 8-bit coverage, row by row from the top, at its zoom bucket's size. */
export interface RasterizedGlyph {
  width: number
  height: number
  /** How far the bitmap's left edge sits from the glyph origin, at the bucket's size. */
  bearingX: number
  /** How far the bitmap's top edge sits above the baseline, at the bucket's size. */
  bearingY: number
  pixels: Uint8Array
}

/** Draws a glyph's outline into pixels. The atlas does not know how; the renderer supplies it. */
export type GlyphRasterizer = (key: GlyphKey) => RasterizedGlyph

/** Where a glyph's pixels are in the atlas. */
export interface AtlasGlyph {
  pageIndex: number
  /** The glyph's own pixels, without the padding around them. */
  rectangle: AtlasRectangle
  bearingX: number
  bearingY: number
  /** True for glyphs with nothing to draw, such as a space; they take no room. */
  isEmpty: boolean
}

/** Pixels the renderer must copy into a page's texture. */
export interface AtlasUpload {
  pageIndex: number
  rectangle: AtlasRectangle
  pixels: Uint8Array
}

export interface GlyphAtlasOptions {
  pageWidth: number
  pageHeight: number
  /** How many pages the atlas may grow to before it evicts. */
  maxPages: number
  /** Empty texels around each glyph, so filtering at its edge does not pick up a neighbour. */
  padding: number
  rasterizeGlyph: GlyphRasterizer
}

export interface GlyphAtlas {
  pageWidth: number
  pageHeight: number
  /**
   * Starts a frame. Pages used since this call are not evicted, so a glyph placed earlier in the
   * frame is never overwritten by one placed later.
   */
  beginFrame: () => void
  /**
   * Finds a glyph, drawing and packing it the first time. Undefined when it cannot be placed:
   * larger than a page, or every page is in use this frame.
   */
  lookupGlyph: (key: GlyphKey) => AtlasGlyph | undefined
  /** Hands over the pixels placed since the last call, once, for the renderer to upload. */
  takePendingUploads: () => AtlasUpload[]
  /** Hands over the pages evicted since the last call, once; every glyph on them is gone. */
  takeClearedPages: () => number[]
  getPageCount: () => number
  getGlyphCount: () => number
}

/** Where a rectangle went, and the page cleared to make room for it, if one was. */
export interface PagePlacement {
  pageIndex: number
  rectangle: AtlasRectangle
  evicted: { pageIndex: number; glyphIds: readonly string[] } | undefined
}

/** The atlas's pages: packing, growing and choosing which to clear. */
export interface AtlasPagePool {
  beginFrame: () => void
  /** Finds room for a rectangle: on a page, on a new one, or on the page cleared for it. */
  place: (width: number, height: number) => PagePlacement | undefined
  /** Notes a lookup on a page, so it is not the next to go. */
  markUsed: (pageIndex: number) => void
  /** Records which glyph a page now holds, so clearing it can name them. */
  addGlyph: (pageIndex: number, glyphId: string) => void
  getPageCount: () => number
}

/** A canvas transform as the six numbers `setTransform` takes. */
export type CanvasTransform = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number
]

/** How to draw one outline into a bitmap at a zoom bucket. */
export interface GlyphRasterPlan {
  width: number
  height: number
  /** Bitmap pixels per font unit. */
  scale: number
  /** The bitmap's left edge, in pixels from the glyph origin. */
  bearingX: number
  /** The bitmap's top edge, in pixels above the baseline. */
  bearingY: number
  /** Maps the outline's font units, y up, to bitmap pixels, y down. */
  transform: CanvasTransform
}

/** Fills an outline, given as SVG path data, into one byte of coverage per pixel. */
export type CoverageDrawer = (plan: GlyphRasterPlan, pathData: string) => Uint8Array

/** What a text layout depends on; two nodes with the same request share one layout. */
export interface TextLayoutRequest extends TextLayoutInput, TextFace {}

export interface FontLibraryOptions {
  /** Finds a family's files through the font API. */
  resolveFamily: ResolveFontFamily
  store: FontStore
}

/** Every family list's fonts, found through the font API as texts ask for them. */
export interface FontLibrary {
  /** The fonts a `fontFamily` list draws with; undefined until `loadFamilies` has found them. */
  getRegistry: (face: TextFace) => FontRegistry | undefined
  /** Looks up the list's families and their fallbacks. Rejects when the font API has none of them. */
  loadFamilies: (face: TextFace) => Promise<void>
  getFont: (fontId: string) => ShapingFont | undefined
  /** The file a loaded font was read from, which a PDF embeds; undefined until it has loaded. */
  getFontBytes: (fontId: string) => Uint8Array | undefined
}

export interface TextEngineOptions {
  library: FontLibrary
  /** Whether WebAssembly exists, which HarfBuzz needs; false keeps every text on the fallback. */
  isShapingAvailable?: () => boolean
  /** How many layouts to keep before the oldest are dropped. */
  layoutLimit?: number
}

/** Lays text out with HarfBuzz, loading fonts as texts ask for them, and remembers the results. */
export interface TextEngine {
  /**
   * The layout of a request. Undefined while its fonts are still loading, when it holds a
   * character none of its fonts covers, or where shaping is unavailable: the caller draws those
   * with the Canvas 2D fallback. Asking starts the font load and, once it ends, the listeners run.
   */
  getLayout: (request: TextLayoutRequest) => TextLayout | undefined
  /** `getLayout` for a node, and cheaper on a node object it has seen. */
  getNodeLayout: (node: DesignNode) => TextLayout | undefined
  /** The layout when it is cached or its fonts are loaded; asking never loads anything. */
  peekLayout: (request: TextLayoutRequest) => TextLayout | undefined
  /** Calls the listener when fonts finish loading, so a canvas can draw again. */
  subscribe: (listener: () => void) => () => void
}

export interface FallbackTextInput {
  text: string
  /** The width of a fixed-width box to wrap in; undefined lets each line run as long as it is. */
  wrapWidth: number | undefined
  alignment: TextAlign
  fontSize: number
  /** The distance between lines, as a multiple of the font size. */
  lineHeight: number
  /** The font's ascent and descent at this size, which place the baseline in the line. */
  ascent: number
  descent: number
}

export interface FallbackLine {
  text: string
  /** Where the line starts, from the box's left edge, for its alignment. */
  x: number
  /** The line's advance without its hanging spaces. */
  width: number
  baselineY: number
}

export interface FallbackTextLayout {
  lines: readonly FallbackLine[]
  width: number
  height: number
}

/** The fonts and the engine that lays text out with them. */
export interface TextRuntime {
  library: FontLibrary
  engine: TextEngine
}
