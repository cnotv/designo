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
import type { LaidOutLine, PlacedGlyph } from '@designo/text'
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
  graphicsStates: Map<string, GraphicsState>
}

interface GraphicsState {
  name: string
  dictionary: ReturnType<Pdf['ref']>
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

const createGraphicsState = (
  pdf: Pdf,
  name: string,
  opacity: number,
  blendMode: DesignNode['blendMode']
): GraphicsState => {
  const dictionary = pdf.ref({
    Type: 'ExtGState',
    ca: opacity,
    CA: opacity,
    BM: PDF_BLEND_MODES[blendMode]
  })
  dictionary.end(undefined)
  return { name, dictionary }
}

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
  const state =
    known ?? createGraphicsState(pdf, `DesignoGs${graphicsStates.size}`, opacity, blendMode)
  graphicsStates.set(key, state)
  // A page's resources are its own, so a state made on an earlier page is listed on this one too.
  pdf.page.ext_gstates[state.name] = state.dictionary
  pdf.addContent(`/${state.name} gs`)
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

interface TextRun {
  fontId: string
  /** Where the first glyph sits, from the text box's corner. */
  x: number
  y: number
  /** The characters of the word, then the spaces after it, so the text layer keeps them. */
  text: string
  /** Characters before the word's last glyph, and how far that glyph sits from the first. */
  prefixText: string
  lastGlyphOffset: number
  /** The colour of the span the word is in; undefined follows the node's fill. */
  fill: string | undefined
  /** True for a list marker, which never joins the word after it. */
  isMarker: boolean
}

const isSpace = (text: string): boolean => text.trim() === ''

// A list marker stands for no character of the text, so it brings its own.
const getRunGlyphText = (text: string, line: LaidOutLine, glyph: PlacedGlyph): string =>
  glyph.markerText ?? getGlyphText(text, line, glyph.cluster)

// A word is a run of glyphs in one font and one colour, moving forward; the spaces after it join it
// as text only. One text object per word lets extractors read real spaces and costs far less than
// one per glyph.
const getLineRuns = (text: string, line: LaidOutLine): TextRun[] =>
  line.glyphs.reduce<TextRun[]>((runs, glyph) => {
    const glyphText = getRunGlyphText(text, line, glyph)
    const last = runs.at(-1)
    if (glyphText === '') return runs
    if (isSpace(glyphText)) {
      if (last) last.text += glyphText
      return runs
    }
    const isMarker = glyph.markerText !== undefined
    const continues =
      last !== undefined &&
      last.fontId === glyph.fontId &&
      last.fill === glyph.fill &&
      last.isMarker === isMarker &&
      !isSpace(last.text.slice(-1)) &&
      glyph.x > last.x + last.lastGlyphOffset
    if (continues) {
      last.prefixText = last.text
      last.lastGlyphOffset = glyph.x - last.x
      last.text += glyphText
      return runs
    }
    return [
      ...runs,
      {
        fontId: glyph.fontId,
        x: glyph.x,
        y: glyph.y,
        text: glyphText,
        prefixText: '',
        lastGlyphOffset: 0,
        fill: glyph.fill,
        isMarker
      }
    ]
  }, [])

const setPaint = (context: ExportContext, fill: string, opacity: number): void => {
  const paint = parsePaint(fill)
  setGraphicsState(context, opacity * paint.alpha, 'normal')
  context.pdf.fillColor(paint.color)
}

const drawRun = (context: ExportContext, node: DesignNode, run: TextRun, opacity: number): void => {
  const { pdf } = context
  // A span with a colour of its own paints its words with it; the restore gives the node's back.
  if (run.fill !== undefined) {
    pdf.save()
    setPaint(context, run.fill, opacity)
  }
  pdf.font(useFont(context, run.fontId)).fontSize(node.fontSize)
  // The layout places each glyph, kerning included; pdfkit advances by the font's own widths, so
  // the difference is spread over the word's characters to land its last glyph where the layout did.
  const characterSpacing =
    run.prefixText === ''
      ? 0
      : (run.lastGlyphOffset - pdf.widthOfString(run.prefixText)) / run.prefixText.length
  pdf.text(run.text, node.x + run.x, node.y + run.y, {
    baseline: 'alphabetic',
    lineBreak: false,
    characterSpacing
  })
  if (run.fill !== undefined) pdf.restore()
}

const drawLayoutText = (
  context: ExportContext,
  node: DesignNode,
  lines: readonly LaidOutLine[],
  opacity: number
): void =>
  lines.forEach((line) =>
    getLineRuns(node.text, line).forEach((run) => drawRun(context, node, run, opacity))
  )

const drawText = (context: ExportContext, node: DesignNode, opacity: number): void => {
  if (node.fill === null || node.text === '') return
  setPaint(context, node.fill, opacity)
  const layout = context.options.getTextLayout(node)
  if (!layout) {
    throw new Error(
      `The text "${node.name || node.id}" could not be laid out: the fonts for its family, or for a character in it, are not available.`
    )
  }
  drawLayoutText(context, node, layout.lines, opacity)
}

const drawRaster = (context: ExportContext, node: DesignNode, image: Uint8Array): void => {
  const bounds = getExportBounds(context.document, node)
  setGraphicsState(context, 1, node.blendMode)
  context.pdf.image(new Uint8Array(image).buffer, bounds.x, bounds.y, {
    width: bounds.width,
    height: bounds.height
  })
}

// PNG and JPEG are embedded as they are; the PDF library reads no other type. A picture that is
// not stretched is drawn to a PNG too, because the PDF knows the box but not the picture's size.
const EMBEDDABLE_IMAGE = /\.(?:png|jpg)$/

const isEmbeddableImage = (node: DesignNode): boolean =>
  node.imageAsset !== null && node.imageFit === 'stretch' && EMBEDDABLE_IMAGE.test(node.imageAsset)

const drawImage = (context: ExportContext, node: DesignNode, opacity: number): void => {
  const bytes =
    node.imageAsset === null ? undefined : context.options.getImageBytes?.(node.imageAsset)
  if (!bytes || !isEmbeddableImage(node)) {
    paintFill(context, node, opacity)
    return
  }
  setGraphicsState(context, opacity, 'normal')
  context.pdf.image(new Uint8Array(bytes).buffer, node.x, node.y, {
    width: node.width,
    height: node.height
  })
}

interface LinkBox {
  x: number
  y: number
  width: number
  height: number
}

// Where the node's own rotation puts the box: the smallest upright box around its turned corners.
// pdfkit's rectangle conversion goes wrong under rotation, so a link is written outside it.
// ponytail: an ancestor's rotation still skews the box; the corners would need the full matrix.
const getTurnedBox = (node: DesignNode, box: LinkBox): LinkBox => {
  if (node.rotation === 0) return box
  const centerX = node.x + node.width / 2
  const centerY = node.y + node.height / 2
  const angle = (node.rotation * Math.PI) / 180
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height]
  ].map(([x = 0, y = 0]) => ({
    x: centerX + (x - centerX) * Math.cos(angle) - (y - centerY) * Math.sin(angle),
    y: centerY + (x - centerX) * Math.sin(angle) + (y - centerY) * Math.cos(angle)
  }))
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  }
}

// A wrapped text is clickable along each of its lines, not over the empty corners of its box.
const getLinkBoxes = (context: ExportContext, node: DesignNode): LinkBox[] => {
  const layout = node.type === 'text' ? context.options.getTextLayout(node) : undefined
  if (!layout || layout.lines.length === 0) return [node]
  return layout.lines.map((line) => ({
    x: node.x + line.x,
    y: node.y + line.top,
    width: line.width,
    height: layout.lineHeight
  }))
}

const LINKABLE_TYPES: readonly DesignNode['type'][] = ['text', 'rectangle', 'frame']

const writeLinks = (context: ExportContext, node: DesignNode): void => {
  if (node.link === null || !LINKABLE_TYPES.includes(node.type)) return
  const { link } = node
  getLinkBoxes(context, node)
    .map((box) => getTurnedBox(node, box))
    .forEach((box) => context.pdf.link(box.x, box.y, box.width, box.height, link))
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
    else if (node.type === 'image') drawImage(context, node, opacity)
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
  writeLinks(context, node)
}

// Frames marked as pages are the PDF's pages, in their order; a document with none prints a page
// for each design page. The mark only counts on a frame.
const getPdfPages = (document: DesignDocument): DesignNode[] => {
  const marked = Object.values(document.nodes)
    .filter((node) => node.type === 'frame' && node.pdfPage !== null)
    .toSorted((first, second) => (first.pdfPage ?? 0) - (second.pdfPage ?? 0))
  return marked.length > 0 ? marked : getPageNodes(document)
}

// A WebP or a GIF is drawn to a PNG with the other nodes that need an image.
const isRasterImage = (node: DesignNode): boolean =>
  node.type === 'image' && node.imageAsset !== null && !isEmbeddableImage(node)

const rasterizeEffects = async (
  document: DesignDocument,
  options: PdfExportOptions
): Promise<Map<string, Uint8Array>> => {
  const { rasterizeNode } = options
  if (!rasterizeNode) return new Map()
  const nodes = getPdfPages(document)
    .flatMap((page) => getSubtreeIds(document, page.id))
    .flatMap((id) => {
      const node = document.nodes[id]
      return node?.visible && (hasFilter(node) || isRasterImage(node)) ? [node] : []
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
 * Writes a document as one PDF. Its pages are the frames marked with a `pdfPage`, in that order,
 * each as large as the frame and clipped to it; with no such frame, a page for each design page,
 * as large as its visible content. A design unit is a point. Shapes, frames that clip,
 * gradients, opacity and blend modes are PDF drawing; text is set in the fonts its layout used,
 * embedded and selectable; a node with blur or a shadow is an image, since a PDF has no blur.
 * A text, rectangle or frame with a `link` is clickable in the PDF: an annotation over its box,
 * or over each line of a wrapped text. Layout guides are not part of a document's nodes, so none
 * is drawn.
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
  getPdfPages(document).forEach((page) => {
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
