import type { DesignNode } from '@designo/core'
import { bucketGlyphZoom } from '../text/glyphAtlasKeys.ts'
import type { AtlasGlyph, PlacedGlyph, TextLayout } from '@designo/text'
import { parseHexColor } from '../scene.ts'
import type { TextDrawList, TextDrawListInput, TextDrawStep } from '../types.ts'

/** Vertices per glyph: a quad's four corners, drawn as two triangles by a shared index pattern. */
export const GLYPH_VERTICES = 4

/**
 * Words (four bytes) per vertex: the world position as two floats, the atlas position as two
 * normalised 16-bit integers, and the premultiplied colour as four normalised bytes. Quads are
 * plain triangles rather than instances because software GL, which headless Chromium and some
 * machines without a GPU use, draws 60,000 instances 30 times slower than the same quads as
 * triangles.
 */
export const GLYPH_VERTEX_WORDS = 4
export const GLYPH_WORDS = GLYPH_VERTICES * GLYPH_VERTEX_WORDS
export const GLYPH_BYTES = GLYPH_WORDS * 4

const UINT16_MAX = 65_535
const UINT8_MAX = 255
const BITS_PER_16 = 16
const BITS_PER_BYTE = 8
// Past this, a glyph's bitmap would have to be rasterised larger than the atlas keeps its
// biggest bucket twice over, and scaling it up would blur it; the Canvas 2D path stays sharp.
const MAX_GLYPH_PIXELS_PER_EM = 512
const HALF_TURN_DEGREES = 180
const INITIAL_GLYPH_CAPACITY = 4096

// Top left, top right, bottom left and bottom right, as the shared index pattern expects.
const CORNERS = [
  { across: 0, down: 0 },
  { across: 1, down: 0 },
  { across: 0, down: 1 },
  { across: 1, down: 1 }
] as const

interface BuilderMark {
  glyphCount: number
  stepCount: number
  lastStepGlyphs: number
}

interface VertexViews {
  floats: Float32Array
  words: Uint32Array
}

const createViews = (glyphCapacity: number): VertexViews => {
  const buffer = new ArrayBuffer(glyphCapacity * GLYPH_BYTES)
  return { floats: new Float32Array(buffer), words: new Uint32Array(buffer) }
}

// Vertices are written into one growing buffer, because a frame can place tens of thousands of
// glyphs and an object each would be most of what it costs.
const createVertexBuilder = () => {
  const state = {
    views: createViews(INITIAL_GLYPH_CAPACITY),
    glyphCount: 0,
    steps: [] as TextDrawStep[]
  }

  const ensureRoom = (): void => {
    if ((state.glyphCount + 1) * GLYPH_WORDS <= state.views.words.length) return
    const grown = createViews((state.views.words.length / GLYPH_WORDS) * 2)
    grown.words.set(state.views.words)
    state.views = grown
  }

  const extendOrStartRun = (pageIndex: number): void => {
    const last = state.steps.at(-1)
    if (last?.kind === 'glyphs' && last.pageIndex === pageIndex) {
      last.glyphCount += 1
      return
    }
    state.steps.push({
      kind: 'glyphs',
      pageIndex,
      firstGlyph: state.glyphCount,
      glyphCount: 1
    })
  }

  return {
    // Reserves the next glyph on a page and returns the views and the word its vertices start at.
    reserveGlyph: (pageIndex: number): { views: VertexViews; start: number } => {
      ensureRoom()
      extendOrStartRun(pageIndex)
      const start = state.glyphCount * GLYPH_WORDS
      state.glyphCount += 1
      return { views: state.views, start }
    },
    addFallback: (node: DesignNode): void => {
      state.steps.push({ kind: 'fallback', node })
    },
    mark: (): BuilderMark => {
      const last = state.steps.at(-1)
      return {
        glyphCount: state.glyphCount,
        stepCount: state.steps.length,
        lastStepGlyphs: last?.kind === 'glyphs' ? last.glyphCount : 0
      }
    },
    rollback: (mark: BuilderMark): void => {
      state.glyphCount = mark.glyphCount
      state.steps.length = mark.stepCount
      const last = state.steps.at(-1)
      if (last?.kind === 'glyphs') last.glyphCount = mark.lastStepGlyphs
    },
    finish: (): TextDrawList => ({
      vertices: new Uint8Array(state.views.words.buffer, 0, state.glyphCount * GLYPH_BYTES),
      steps: state.steps
    })
  }
}

type VertexBuilder = ReturnType<typeof createVertexBuilder>

// A node read from a reactive document costs a tracked read per field, and a text node is read
// once per glyph, so what placing needs is copied out once per node.
interface NodePlacement {
  centerX: number
  centerY: number
  halfWidth: number
  halfHeight: number
  /** World units per bitmap pixel: the font size over the zoom bucket. */
  unitsPerBitmapPixel: number
  zoomBucket: number
  cosine: number
  sine: number
  /** The premultiplied fill with the node's opacity folded into its alpha, packed as four bytes. */
  packedColor: number
  opacity: number
  /** Where the screen's pixel grid is, for a node that is not turned; undefined for one that is. */
  pixelGrid: PixelGrid | undefined
}

interface PixelGrid {
  devicePixelsPerUnit: number
  offsetX: number
  offsetY: number
}

// A glyph drawn at its bucket's size lands on whole pixels only if its corner does, and a corner
// between pixels blurs it by a pixel through the filter. Turned text cannot be snapped without
// bending its glyphs, so only upright nodes are.
const snapToPixel = (world: number, devicePixelsPerUnit: number, offset: number): number =>
  (Math.round(world * devicePixelsPerUnit + offset) - offset) / devicePixelsPerUnit

const toByte = (channel: number): number => Math.round(channel * UINT8_MAX)

const packColor = (fill: string | null, opacity: number): number => {
  const { red, green, blue, alpha } = parseHexColor(fill ?? '#000000')
  const total = alpha * opacity
  return (
    (toByte(red * total) |
      (toByte(green * total) << BITS_PER_BYTE) |
      (toByte(blue * total) << (BITS_PER_BYTE * 2)) |
      (toByte(total) << (BITS_PER_BYTE * 3))) >>>
    0
  )
}

const packAtlasPosition = (u: number, v: number): number =>
  (Math.round(u * UINT16_MAX) | (Math.round(v * UINT16_MAX) << BITS_PER_16)) >>> 0

const writeGlyphQuad = (
  slot: { views: VertexViews; start: number },
  placement: NodePlacement,
  glyph: PlacedGlyph,
  atlasGlyph: AtlasGlyph,
  atlas: TextDrawListInput['atlas']
): void => {
  const { centerX, centerY, halfWidth, halfHeight, unitsPerBitmapPixel: unit } = placement
  const { cosine, sine, packedColor } = placement
  const { rectangle } = atlasGlyph
  const { floats, words } = slot.views
  // Measured from the node's centre, which it turns around, so the corner can be rotated whole.
  const fromCenterX = glyph.x + atlasGlyph.bearingX * unit - halfWidth
  const fromCenterY = glyph.y - atlasGlyph.bearingY * unit - halfHeight
  const width = rectangle.width * unit
  const height = rectangle.height * unit
  const rotatedX = centerX + fromCenterX * cosine - fromCenterY * sine
  const rotatedY = centerY + fromCenterX * sine + fromCenterY * cosine
  const grid = placement.pixelGrid
  const originX = grid ? snapToPixel(rotatedX, grid.devicePixelsPerUnit, grid.offsetX) : rotatedX
  const originY = grid ? snapToPixel(rotatedY, grid.devicePixelsPerUnit, grid.offsetY) : rotatedY
  const left = rectangle.x / atlas.pageWidth
  const top = rectangle.y / atlas.pageHeight
  const right = (rectangle.x + rectangle.width) / atlas.pageWidth
  const bottom = (rectangle.y + rectangle.height) / atlas.pageHeight
  CORNERS.forEach(({ across, down }, corner) => {
    const base = slot.start + corner * GLYPH_VERTEX_WORDS
    const alongX = across * width
    const alongY = down * height
    floats[base] = originX + alongX * cosine - alongY * sine
    floats[base + 1] = originY + alongX * sine + alongY * cosine
    words[base + 2] = packAtlasPosition(across ? right : left, down ? bottom : top)
    words[base + 3] = packedColor
  })
}

const placeGlyph = (
  builder: VertexBuilder,
  placement: NodePlacement,
  glyph: PlacedGlyph,
  atlas: TextDrawListInput['atlas']
): boolean => {
  const atlasGlyph = atlas.lookupGlyph({
    fontId: glyph.fontId,
    glyphId: glyph.glyphId,
    zoomBucket: placement.zoomBucket
  })
  if (!atlasGlyph) return false
  if (atlasGlyph.isEmpty) return true
  // A span with a colour of its own overrides the node's fill for its glyphs.
  const glyphPlacement =
    glyph.fill === undefined
      ? placement
      : { ...placement, packedColor: packColor(glyph.fill, placement.opacity) }
  writeGlyphQuad(
    builder.reserveGlyph(atlasGlyph.pageIndex),
    glyphPlacement,
    glyph,
    atlasGlyph,
    atlas
  )
  return true
}

const placeNode = (
  builder: VertexBuilder,
  node: DesignNode,
  layout: TextLayout,
  view: TextDrawListInput['view'],
  atlas: TextDrawListInput['atlas']
): boolean => {
  const { fontSize, width, height } = node
  const { devicePixelsPerUnit } = view
  const zoomBucket = bucketGlyphZoom(fontSize * devicePixelsPerUnit)
  const rotation = (node.rotation * Math.PI) / HALF_TURN_DEGREES
  const placement: NodePlacement = {
    centerX: node.x + width / 2,
    centerY: node.y + height / 2,
    halfWidth: width / 2,
    halfHeight: height / 2,
    zoomBucket,
    unitsPerBitmapPixel: fontSize / zoomBucket,
    cosine: Math.cos(rotation),
    sine: Math.sin(rotation),
    packedColor: packColor(node.fill, node.opacity),
    opacity: node.opacity,
    pixelGrid:
      node.rotation === 0
        ? { devicePixelsPerUnit, offsetX: view.deviceOffsetX, offsetY: view.deviceOffsetY }
        : undefined
  }
  const mark = builder.mark()
  const placedEverything = layout.lines.every((line) =>
    line.glyphs.every((glyph) => placeGlyph(builder, placement, glyph, atlas))
  )
  // A node is drawn whole by one path, so a half-placed one is taken back.
  if (!placedEverything) builder.rollback(mark)
  return placedEverything
}

/**
 * Works out how to draw a run of text nodes with the glyph atlas: one quad per glyph, with its
 * corners already turned with the node, grouped into draws by atlas page, with the nodes the
 * glyph path cannot draw marked for the Canvas 2D texture path in their place in the paint order.
 * It asks the atlas for every glyph, so a glyph is rasterised the first time any node shows it at
 * a zoom bucket and never again.
 * @param input - The nodes, the view they are drawn in, the text engine and the atlas.
 * @returns The vertex data and the steps to draw it with.
 */
export const buildTextDrawList = ({
  items,
  view,
  engine,
  atlas
}: TextDrawListInput): TextDrawList => {
  const builder = createVertexBuilder()
  items.forEach(({ node }) => {
    const layout =
      node.fontSize * view.devicePixelsPerUnit <= MAX_GLYPH_PIXELS_PER_EM
        ? engine.getNodeLayout(node)
        : undefined
    const isPlaced = layout !== undefined && placeNode(builder, node, layout, view, atlas)
    if (!isPlaced) builder.addFallback(node)
  })
  return builder.finish()
}
