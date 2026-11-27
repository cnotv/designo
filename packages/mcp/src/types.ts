import type { TextFace } from '@designo/core'
import type { FontLineMetrics, PdfColorSpace } from '@designo/exporter'
import type { FontFetch, UploadedFont } from '@designo/fonts'
import type { GenerateId } from '@designo/storage'
import type { GlyphOutline, TextLayout, TextLayoutRequest } from '@designo/text'

/** The outcome of rasterizing: the PNG, or one sentence an agent can act on. */
export type RasterizeOutcome = { ok: true; png: Buffer } | { ok: false; message: string }

/** Draws SVG to PNG with the font files given and, after them, whatever fonts the machine has. */
export type Rasterize = (
  svg: string,
  scale: number,
  fontFiles: readonly string[]
) => Promise<RasterizeOutcome>

/** A text on the page being drawn, which needs fonts. */
export interface ScreenshotText extends TextFace {
  text: string
}

/** The fonts found for a screenshot, and how the SVG names them. */
export interface ScreenshotFonts {
  /** The font files, as paths a renderer can read. */
  files: readonly string[]
  /** The renamed family of the file that draws a family list at a weight and style. */
  resolveFontFamily: (face: TextFace) => string | undefined
  /** The metrics of the font a family list draws with, which place its baseline. */
  getFontMetrics: (face: TextFace) => FontLineMetrics | undefined
}

/** Finds the fonts the texts need. */
export type LoadScreenshotFonts = (texts: readonly ScreenshotText[]) => Promise<ScreenshotFonts>

export interface ScreenshotFontLoaderOptions {
  /** Fetches the font API's description of a family. */
  fetchJson?: FontFetch
  /** Fetches a font file. */
  fetchBytes?: (url: string) => Promise<Uint8Array>
  /** Where the answers and the files are kept between screenshots. */
  cacheDirectory?: string
  /** Hears why a font was left out. */
  warn?: (message: string) => void
  /** The account's uploaded fonts, found before the font API's families of the same name. */
  uploadedFonts?: readonly UploadedFont[]
}

export interface RenderLimits {
  /** How long one render may run before the renderer process is killed. */
  timeoutMilliseconds: number
  /** The most pixels one render may draw, which bounds the memory it can need. */
  maxPixels: number
  /** The most memory the renderer process may hold before it is killed. */
  maxMemoryBytes: number
}

export interface RasterizerOptions {
  /** The script run by `node` for each render: SVG on stdin, PNG on stdout. */
  workerPath: string
  limits: RenderLimits
}

/** Lays a text out with the same engine the editor draws with; undefined when it cannot. */
export type LayoutText = (request: TextLayoutRequest) => Promise<TextLayout | undefined>

/** What the text layout needs from outside, so tests can replace the network and the disk. */
export interface TextLayoutFetchers {
  fetchJson?: FontFetch
  fetchBytes?: (url: string) => Promise<Uint8Array>
  cacheDirectory?: string
  /** The account's uploaded fonts, found before the font API's families of the same name. */
  uploadedFonts?: readonly UploadedFont[]
}

export interface DesignoToolContext {
  dataDirectory: string
  generateId: GenerateId
  /** Draws SVG to PNG; the default runs resvg in a child process. Tests and hosts replace it. */
  rasterize?: Rasterize
  /** Finds the fonts a screenshot needs; the default asks the Fontsource API. Tests replace it. */
  loadScreenshotFonts?: LoadScreenshotFonts
  /** Wraps and measures text; the default shapes with fonts from the Fontsource API. Tests replace it. */
  layoutText?: LayoutText
  /** The bytes of a font file by id, which `export_pdf` embeds; the default has the files the layout loaded. */
  getFontBytes?: (fontId: string) => Uint8Array | undefined
  /** Glyph outlines, which a screenshot draws text with; the default has the fonts the layout loaded. */
  getGlyphOutline?: GetGlyphOutline
}

export interface ScreenshotImage {
  mimeType: 'image/png'
  /** Base64-encoded PNG bytes. */
  data: string
}

/** What `export_pdf` answers. */
/** What export_pdf is asked for: the file, and how its pages are prepared for print. */
export interface PdfExportInput {
  fileId: string
  trimMarks?: boolean
  colorSpace?: PdfColorSpace
}

export interface PdfFile {
  mimeType: 'application/pdf'
  /** Base64-encoded PDF bytes. */
  data: string
}

/** What `measure_text` answers: the box a text fills and how it breaks into lines. */
export interface TextMeasurement {
  width: number
  height: number
  lineCount: number
  /** The text of each line, as it breaks. */
  lines: string[]
}

/** An outline of a glyph of a font the layout has loaded; undefined for a font it has not. */
export type GetGlyphOutline = (fontId: string, glyphId: number) => GlyphOutline | undefined

/** The layout, and the bytes and outlines of every font file it has loaded. */
export type NodeLayoutText = LayoutText & {
  getFontBytes: (fontId: string) => Uint8Array | undefined
  getGlyphOutline: GetGlyphOutline
}

/** The text layout and screenshot fonts one account works with, its uploaded fonts included. */
export interface AccountFonts {
  layoutText: NodeLayoutText
  loadScreenshotFonts: LoadScreenshotFonts
}
