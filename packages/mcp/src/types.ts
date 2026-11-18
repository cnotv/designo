import type { FontLineMetrics } from '@designo/exporter'
import type { FontFetch } from '@designo/fonts'
import type { GenerateId } from '@designo/storage'

/** The outcome of rasterizing: the PNG, or one sentence an agent can act on. */
export type RasterizeOutcome = { ok: true; png: Buffer } | { ok: false; message: string }

/** Draws SVG to PNG with the font files given and, after them, whatever fonts the machine has. */
export type Rasterize = (
  svg: string,
  scale: number,
  fontFiles: readonly string[]
) => Promise<RasterizeOutcome>

/** A text on the page being drawn, which needs fonts. */
export interface ScreenshotText {
  fontFamily: string
  text: string
}

/** The fonts found for a screenshot, and how the SVG names them. */
export interface ScreenshotFonts {
  /** The font files, as paths a renderer can read. */
  files: readonly string[]
  /** The renamed family of the file that draws a family list. */
  resolveFontFamily: (fontFamily: string) => string | undefined
  /** The metrics of the font a family list draws with, which place its baseline. */
  getFontMetrics: (fontFamily: string) => FontLineMetrics | undefined
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

export interface DesignoToolContext {
  dataDirectory: string
  generateId: GenerateId
  /** Draws SVG to PNG; the default runs resvg in a child process. Tests and hosts replace it. */
  rasterize?: Rasterize
  /** Finds the fonts a screenshot needs; the default asks the Fontsource API. Tests replace it. */
  loadScreenshotFonts?: LoadScreenshotFonts
}

export interface ScreenshotImage {
  mimeType: 'image/png'
  /** Base64-encoded PNG bytes. */
  data: string
}
