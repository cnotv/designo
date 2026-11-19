import PDFDocument from 'pdfkit'
import {
  getChildren,
  getFillGradient,
  getPageNodes,
  getGradientLine,
  getSubtreeIds,
  hasLayerEffects,
  type DesignDocument,
  type DesignNode
} from '@designo/core'
import type { LaidOutLine } from '@designo/text'
import { getExportBounds, hasFilter } from './svg.ts'
import type { PdfExportOptions } from './types.ts'

type Pdf = InstanceType<typeof PDFDocument>

// The names the PDF format gives the blend modes Designo has.
const PDF_BLEND_MODES: Record<DesignNode['blendMode'], string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  darken: 'Darken',
  lighten: 'Lighten'
}
const ALPHA_DIVISOR = 255
const RADIAL_UNIT_RADIUS = 0.5
const HEX_COLOR_LENGTH = 7
const MIN_PAGE_SIZE = 1

interface ExportContext {
  pdf: Pdf
  options: PdfExportOptions
  document: DesignDocument
  /** Nodes with blur or a shadow, drawn to images ahead of the page. */
  rasters: ReadonlyMap<string, Uint8Array>
  graphicsStates: Map<string, string>
}

interface Paint {
  color: string
  alpha: number
}

// Colours are `#rrggbb` or `#rrggbbaa`; the PDF takes the alpha apart from the colour.
const parsePaint = (hex: string): Paint => ({
  color: hex.slice(0, HEX_COLOR_LENGTH),
  alpha:
    hex.length > HEX_COLOR_LENGTH
      ? Number.parseInt(hex.slice(HEX_COLOR_LENGTH), 16) / ALPHA_DIVISOR
      : 1
})

/**
 * Sets how the next marks combine with what is beneath: how opaque they are and which blend mode.
 * pdfkit only writes opacity, so the dictionary that also carries `BM` is written here.
 * @param context - The document being written.
 * @param opacity - From 0 to 1.
 * @param blendMode - The node's blend mode.
 */
const setGraphicsState = (
  { pdf, graphicsStates }: ExportContext,
  opacity: number,
  blendMode: DesignNode['blendMode']
): void => {
  const key = `${opacity}|${blendMode}`
  const known = graphicsStates.get(key)
  const name = known ?? `DesignoGs${graphicsStates.size}`
  if (!known) {
    const dictionary = pdf.ref({
      Type: 'ExtGState',
      ca: opacity,
      CA: opacity,
      BM: PDF_BLEND_MODES[blendMode]
    })
    dictionary.end(undefined)
    graphicsStates.set(key, name)
    pdf.page.ext_gstates[name] = dictionary
  }
  pdf.addContent(`/${name} gs`)
}

const applyRotation = ({ pdf }: ExportContext, node: DesignNode): void => {
  if (node.rotation === 0) return
  pdf.rotate(node.rotation, { origin: [node.x + node.width / 2, node.y + node.height / 2] })
}

// A radius larger than half the shorter side would fold the corners over; the SVG clamps it too.
const traceShape = ({ pdf }: ExportContext, node: DesignNode): void => {
  if (node.type === 'ellipse') {
    pdf.ellipse(node.x + node.width / 2, node.y + node.height / 2, node.width / 2, node.height / 2)
    return
  }
  const radius = Math.min(node.cornerRadius, node.width / 2, node.height / 2)
  if (radius > 0) pdf.roundedRect(node.x, node.y, node.width, node.height, radius)
  else pdf.rect(node.x, node.y, node.width, node.height)
}

// A linear gradient is placed in the node's own space, so it turns with the node.
const fillLinearGradient = (
  context: ExportContext,
  node: DesignNode,
  stops: NonNullable<DesignNode['gradient']>['stops']
): void => {
  const { pdf } = context
  const { gradient } = node
  if (!gradient) return
  const line = getGradientLine(node, gradient)
  const paint = pdf.linearGradient(
    node.x + line.startX,
    node.y + line.startY,
    node.x + line.endX,
    node.y + line.endY
  )
  stops.forEach((stop) => {
    const { color, alpha } = parsePaint(stop.color)
    paint.stop(stop.offset, color, alpha)
  })
  traceShape(context, node)
  pdf.fill(paint)
}

// A radial gradient in a PDF is circular. Drawing it in a space scaled to the node's box turns it
// into the ellipse the editor shows, with the shape as the clip.
const fillRadialGradient = (
  context: ExportContext,
  node: DesignNode,
  stops: NonNullable<DesignNode['gradient']>['stops']
): void => {
  const { pdf } = context
  if (node.width === 0 || node.height === 0) return
  pdf.save()
  traceShape(context, node)
  pdf.clip()
  pdf.translate(node.x + node.width / 2, node.y + node.height / 2)
  pdf.scale(node.width, node.height)
  const paint = pdf.radialGradient(0, 0, 0, 0, 0, RADIAL_UNIT_RADIUS)
  stops.forEach((stop) => {
    const { color, alpha } = parsePaint(stop.color)
    paint.stop(stop.offset, color, alpha)
  })
  pdf.rect(-RADIAL_UNIT_RADIUS, -RADIAL_UNIT_RADIUS, 1, 1).fill(paint)
  pdf.restore()
}

const paintFill = (context: ExportContext, node: DesignNode, opacity: number): void => {
  const { pdf } = context
  setGraphicsState(context, opacity, hasLayerEffects(node) ? node.blendMode : 'normal')
  const gradient = getFillGradient(node)
  if (gradient) {
    const fill = gradient.kind === 'radial' ? fillRadialGradient : fillLinearGradient
    fill(context, node, gradient.stops)
    return
  }
  if (node.fill === null) return
  const { color, alpha } = parsePaint(node.fill)
  setGraphicsState(context, opacity * alpha, hasLayerEffects(node) ? node.blendMode : 'normal')
  traceShape(context, node)
  pdf.fill(color)
}

const paintStroke = (context: ExportContext, node: DesignNode, opacity: number): void => {
  if (node.stroke === null || node.strokeWidth <= 0) return
  const { pdf } = context
  const { color, alpha } = parsePaint(node.stroke)
  setGraphicsState(context, opacity * alpha, hasLayerEffects(node) ? node.blendMode : 'normal')
  traceShape(context, node)
  pdf.lineWidth(node.strokeWidth).stroke(color)
}

// Each line of a laid-out text lists glyphs with the character they stand for. The PDF is given
// that character, so it can be selected and searched, at the exact place the layout put the glyph.
const getGlyphText = (text: string, line: LaidOutLine, cluster: number): string => {
  const next = line.glyphs
    .map((glyph) => glyph.cluster)
    .filter((candidate) => candidate > cluster)
    .reduce((least, candidate) => Math.min(least, candidate), line.end)
  return text.slice(cluster, next).replaceAll(/[\t\n\r]/g, '')
}

// pdfkit embeds a font once however often it is registered under a name.
const useFont = ({ pdf, options }: ExportContext, fontId: string): string => {
  const name = `designo-${fontId}`
  const bytes = options.getFontBytes(fontId)
  if (!bytes) throw new Error(`The font ${fontId} is not available to embed.`)
  pdf.registerFont(name, bytes)
  return name
}

const drawLayoutText = (
  context: ExportContext,
  node: DesignNode,
  lines: readonly LaidOutLine[]
): void => {
  const { pdf } = context
  lines.forEach((line) =>
    line.glyphs.forEach((glyph) => {
      const text = getGlyphText(node.text, line, glyph.cluster)
      if (text.trim() === '') return
      pdf
        .font(useFont(context, glyph.fontId))
        .fontSize(node.fontSize)
        .text(text, node.x + glyph.x, node.y + glyph.y, {
          baseline: 'alphabetic',
          lineBreak: false
        })
    })
  )
}

const drawText = (context: ExportContext, node: DesignNode, opacity: number): void => {
  if (node.fill === null || node.text === '') return
  const { color, alpha } = parsePaint(node.fill)
  setGraphicsState(context, opacity * alpha, 'normal')
  context.pdf.fillColor(color)
  const layout = context.options.getTextLayout(node)
  if (!layout) {
    throw new Error(
      `The text "${node.name || node.id}" could not be laid out: the fonts for its family, or for a character in it, are not available.`
    )
  }
  drawLayoutText(context, node, layout.lines)
}

const drawRaster = (context: ExportContext, node: DesignNode, image: Uint8Array): void => {
  const bounds = getExportBounds(context.document, node)
  setGraphicsState(context, 1, node.blendMode)
  context.pdf.image(new Uint8Array(image).buffer, bounds.x, bounds.y, {
    width: bounds.width,
    height: bounds.height
  })
}

const drawChildren = (context: ExportContext, node: DesignNode, opacity: number): void =>
  getChildren(context.document, node.id).forEach((child) => drawNode(context, child, opacity))

// A PDF scales the marks it draws, not a group of them, so a group's or frame's opacity is passed
// down to each mark in it. Overlapping children show through each other where the editor would
// fade them together.
// ponytail: transparency groups would fade a group as one; add when overlap in faded groups matters.
const drawNode = (context: ExportContext, node: DesignNode, inheritedOpacity: number): void => {
  if (!node.visible) return
  const { pdf } = context
  const raster = context.rasters.get(node.id)
  const opacity = inheritedOpacity * node.opacity
  pdf.save()
  if (raster) {
    drawRaster(context, node, raster)
  } else {
    applyRotation(context, node)
    if (node.type === 'text') drawText(context, node, opacity)
    else if (node.type === 'page' || node.type === 'group') drawChildren(context, node, opacity)
    else {
      paintFill(context, node, opacity)
      paintStroke(context, node, opacity)
      if (node.type === 'frame') {
        pdf.save()
        traceShape(context, node)
        pdf.clip()
        drawChildren(context, node, opacity)
        pdf.restore()
      }
    }
  }
  pdf.restore()
}

const rasterizeEffects = async (
  document: DesignDocument,
  options: PdfExportOptions
): Promise<Map<string, Uint8Array>> => {
  const { rasterizeNode } = options
  if (!rasterizeNode) return new Map()
  const nodes = getPageNodes(document)
    .flatMap((page) => getSubtreeIds(document, page.id))
    .flatMap((id) => {
      const node = document.nodes[id]
      return node?.visible && hasFilter(node) ? [node] : []
    })
  const images = await Promise.all(nodes.map((node) => rasterizeNode(node.id)))
  return new Map(
    nodes.flatMap((node, index) => {
      const image = images[index]
      return image ? [[node.id, image] as const] : []
    })
  )
}

// The bytes are joined without Buffer, which a browser does not have.
const joinChunks = (chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  chunks.reduce((offset, chunk) => {
    joined.set(chunk, offset)
    return offset + chunk.length
  }, 0)
  return joined
}

const collectBytes = (pdf: Pdf): Promise<Uint8Array<ArrayBuffer>> =>
  new Promise((resolve, reject) => {
    // Rebinding a local keeps the chunks themselves unmodified.
    let chunks: readonly Uint8Array[] = []
    pdf.on('data', (chunk: Uint8Array) => {
      chunks = [...chunks, chunk]
    })
    pdf.on('end', () => resolve(joinChunks(chunks)))
    pdf.on('error', reject)
  })

/**
 * Writes a document as one PDF with a page for each of its pages, in order. A page is as large
 * as its visible content, in points, one design unit to a point. Shapes, frames that clip,
 * gradients, opacity and blend modes are PDF drawing; text is set in the fonts its layout used,
 * embedded and selectable; a node with blur or a shadow is an image, since a PDF has no blur.
 * Layout guides are not part of a document's nodes, so none is drawn.
 * @param document - The document to write.
 * @param options - How text is laid out, where its fonts are, and how blurred nodes are drawn.
 * @returns The bytes of the PDF.
 */
export const exportDocumentToPdf = async (
  document: DesignDocument,
  options: PdfExportOptions
): Promise<Uint8Array<ArrayBuffer>> => {
  const pdf = new PDFDocument({
    autoFirstPage: false,
    // The PDF's own fonts are not bundled for the browser, and every text is set in an embedded one.
    font: '',
    info: { Title: document.name }
  })
  const bytes = collectBytes(pdf)
  const context: ExportContext = {
    pdf,
    options,
    document,
    rasters: await rasterizeEffects(document, options),
    graphicsStates: new Map()
  }
  getPageNodes(document).forEach((page) => {
    const bounds = getExportBounds(document, page)
    pdf.addPage({
      size: [Math.max(bounds.width, MIN_PAGE_SIZE), Math.max(bounds.height, MIN_PAGE_SIZE)],
      margin: 0
    })
    pdf.save()
    pdf.translate(-bounds.x, -bounds.y)
    drawNode(context, page, 1)
    pdf.restore()
  })
  pdf.end()
  return bytes
}
