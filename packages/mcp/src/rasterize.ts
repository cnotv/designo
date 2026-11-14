import { Resvg } from '@resvg/resvg-js'

/** Lower and upper bounds keep a request from asking for a gigantic bitmap. */
export const MIN_SCREENSHOT_SCALE = 0.1
export const MAX_SCREENSHOT_SCALE = 4

const clampScale = (scale: number): number =>
  Math.min(MAX_SCREENSHOT_SCALE, Math.max(MIN_SCREENSHOT_SCALE, scale))

/**
 * Rasterizes SVG text to PNG bytes. Lives in the MCP package, not the exporter, because
 * resvg ships native bindings and the exporter must stay pure.
 * @param svg - The SVG source.
 * @param scale - Pixels per SVG unit, clamped to a safe range.
 * @returns The PNG file's bytes.
 */
export const rasterizeSvgToPng = (svg: string, scale: number): Buffer =>
  new Resvg(svg, {
    fitTo: { mode: 'zoom', value: clampScale(scale) },
    font: { loadSystemFonts: true }
  })
    .render()
    .asPng()
