import type { GenerateId } from '@designo/storage'

/** The outcome of rasterizing: the PNG, or one sentence an agent can act on. */
export type RasterizeOutcome = { ok: true; png: Buffer } | { ok: false; message: string }

export type Rasterize = (svg: string, scale: number) => Promise<RasterizeOutcome>

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
}

export interface ScreenshotImage {
  mimeType: 'image/png'
  /** Base64-encoded PNG bytes. */
  data: string
}
