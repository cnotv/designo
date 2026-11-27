import { exportNodeToSvg } from '@designo/exporter'
import { exportDocumentToPdf } from '@designo/exporter/pdf'
import { Resvg } from '@resvg/resvg-js'
import type { ParityCase, RgbaImage } from './types.ts'

// The density the editor and the MCP server draw a blurred or shadowed node at for a PDF.
const PDF_RASTER_SCALE = 3

const renderSvg = (svg: string, scale: number): Resvg =>
  // No fonts: the cases hold no text, and the machine's fonts must not change the result.
  new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } })

/**
 * Draws a case's frame from its SVG export with resvg, as the MCP server's screenshot does.
 * @param parityCase - The case to draw.
 * @returns The frame at one pixel per design unit.
 */
export const renderSvgReference = (parityCase: ParityCase): RgbaImage => {
  const rendered = renderSvg(exportNodeToSvg(parityCase.document, parityCase.frameId), 1).render()
  return { width: rendered.width, height: rendered.height, pixels: rendered.pixels }
}

/**
 * Writes a case as a PDF, drawing a blurred or shadowed node to an image as the editor does.
 * @param parityCase - The case to write; its frame is the only page.
 * @returns The PDF bytes.
 */
export const exportCasePdf = (parityCase: ParityCase): Promise<Uint8Array> =>
  exportDocumentToPdf(parityCase.document, {
    getTextLayout: () => undefined,
    getFontBytes: () => undefined,
    rasterizeNode: (nodeId) =>
      Promise.resolve(
        renderSvg(exportNodeToSvg(parityCase.document, nodeId), PDF_RASTER_SCALE).render().asPng()
      )
  })
