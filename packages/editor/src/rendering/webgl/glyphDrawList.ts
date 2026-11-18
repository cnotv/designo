import type { DesignNode } from '@designo/core'
import { bucketGlyphZoom } from '../text/glyphAtlasKeys.ts'
import type { AtlasGlyph, PlacedGlyph, TextLayout } from '../text/types.ts'
import { parseHexColor } from '../scene.ts'
import type { TextDrawList, TextDrawListInput, TextDrawStep } from '../types.ts'

/**
 * Floats per glyph quad: origin x and y, width and height in world units, the rotation's cosine
 * and sine (so the shader turns no angle into sines per vertex), the atlas rectangle as u0 v0 u1
 * v1, and the premultiplied colour.
 */
export const GLYPH_INSTANCE_FLOATS = 14

// Where each field of a glyph instance sits, matching the vertex attributes in the pipeline.
const FIELD = {
  originX: 0,
  originY: 1,
  width: 2,
  height: 3,
  cosine: 4,
  sine: 5,
  u0: 6,
  v0: 7,
  u1: 8,
  v1: 9,
  red: 10,
  green: 11,
  blue: 12,
  alpha: 13
} as const

// Past this, a glyph's bitmap would have to be rasterised larger than the atlas keeps its
// biggest bucket twice over, and scaling it up would blur it; the Canvas 2D path stays sharp.
const MAX_GLYPH_PIXELS_PER_EM = 512
const HALF_TURN_DEGREES = 180
const INITIAL_INSTANCE_CAPACITY = 4096

interface BuilderMark {
  floatCount: number
  stepCount: number
  lastStepInstances: number
}

// Instances are written into one growing buffer, because a frame can place tens of thousands of
// glyphs and an object each would be most of what it costs.
const createInstanceBuilder = () => {
  const state = {
    data: new Float32Array(INITIAL_INSTANCE_CAPACITY * GLYPH_INSTANCE_FLOATS),
    floatCount: 0,
    steps: [] as TextDrawStep[]
  }

  const ensureRoom = (): void => {
    if (state.floatCount + GLYPH_INSTANCE_FLOATS <= state.data.length) return
    const grown = new Float32Array(state.data.length * 2)
    grown.set(state.data)
    state.data = grown
  }

  const extendOrStartRun = (pageIndex: number): void => {
    const last = state.steps.at(-1)
    if (last?.kind === 'glyphs' && last.pageIndex === pageIndex) {
      last.instanceCount += 1
      return
    }
    state.steps.push({
      kind: 'glyphs',
      pageIndex,
      firstInstance: state.floatCount / GLYPH_INSTANCE_FLOATS,
      instanceCount: 1
    })
  }

  return {
    // Reserves the next instance on a page and returns the buffer and where its floats start.
    reserveGlyph: (pageIndex: number): { data: Float32Array; start: number } => {
      ensureRoom()
      extendOrStartRun(pageIndex)
      const start = state.floatCount
      state.floatCount += GLYPH_INSTANCE_FLOATS
      return { data: state.data, start }
    },
    addFallback: (node: DesignNode): void => {
      state.steps.push({ kind: 'fallback', node })
    },
    mark: (): BuilderMark => {
      const last = state.steps.at(-1)
      return {
        floatCount: state.floatCount,
        stepCount: state.steps.length,
        lastStepInstances: last?.kind === 'glyphs' ? last.instanceCount : 0
      }
    },
    rollback: (mark: BuilderMark): void => {
      state.floatCount = mark.floatCount
      state.steps.length = mark.stepCount
      const last = state.steps.at(-1)
      if (last?.kind === 'glyphs') last.instanceCount = mark.lastStepInstances
    },
    finish: (): TextDrawList => ({
      instances: state.data.subarray(0, state.floatCount),
      steps: state.steps
    })
  }
}

type InstanceBuilder = ReturnType<typeof createInstanceBuilder>

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
  /** The premultiplied fill, with the node's opacity folded into its alpha. */
  color: readonly [number, number, number, number]
}

const premultipliedColor = (fill: string | null, opacity: number): NodePlacement['color'] => {
  const { red, green, blue, alpha } = parseHexColor(fill ?? '#000000')
  const total = alpha * opacity
  return [red * total, green * total, blue * total, total]
}

const writeGlyphInstance = (
  slot: { data: Float32Array; start: number },
  placement: NodePlacement,
  glyph: PlacedGlyph,
  atlasGlyph: AtlasGlyph,
  atlas: TextDrawListInput['atlas']
): void => {
  const { centerX, centerY, halfWidth, halfHeight, unitsPerBitmapPixel: unit } = placement
  const { cosine, sine, color } = placement
  const { rectangle } = atlasGlyph
  const { data, start } = slot
  // Measured from the node's centre, which it turns around, so the corner can be rotated whole.
  const fromCenterX = glyph.x + atlasGlyph.bearingX * unit - halfWidth
  const fromCenterY = glyph.y - atlasGlyph.bearingY * unit - halfHeight
  data[start + FIELD.originX] = centerX + fromCenterX * cosine - fromCenterY * sine
  data[start + FIELD.originY] = centerY + fromCenterX * sine + fromCenterY * cosine
  data[start + FIELD.width] = rectangle.width * unit
  data[start + FIELD.height] = rectangle.height * unit
  data[start + FIELD.cosine] = cosine
  data[start + FIELD.sine] = sine
  data[start + FIELD.u0] = rectangle.x / atlas.pageWidth
  data[start + FIELD.v0] = rectangle.y / atlas.pageHeight
  data[start + FIELD.u1] = (rectangle.x + rectangle.width) / atlas.pageWidth
  data[start + FIELD.v1] = (rectangle.y + rectangle.height) / atlas.pageHeight
  data[start + FIELD.red] = color[0]
  data[start + FIELD.green] = color[1]
  data[start + FIELD.blue] = color[2]
  data[start + FIELD.alpha] = color[3]
}

const placeGlyph = (
  builder: InstanceBuilder,
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
  writeGlyphInstance(
    builder.reserveGlyph(atlasGlyph.pageIndex),
    placement,
    glyph,
    atlasGlyph,
    atlas
  )
  return true
}

const placeNode = (
  builder: InstanceBuilder,
  node: DesignNode,
  layout: TextLayout,
  devicePixelsPerUnit: number,
  atlas: TextDrawListInput['atlas']
): boolean => {
  const { fontSize, width, height } = node
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
    color: premultipliedColor(node.fill, node.opacity)
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
 * Works out how to draw a run of text nodes with the glyph atlas: one instanced quad per glyph,
 * grouped into draws by atlas page, with the nodes the glyph path cannot draw marked for the
 * Canvas 2D texture path in their place in the paint order. It asks the atlas for every glyph, so
 * a glyph is rasterised the first time any node shows it at a zoom bucket and never again.
 * @param input - The nodes, the device pixels per world unit, the text engine and the atlas.
 * @returns The instance data and the steps to draw it with.
 */
export const buildTextDrawList = ({
  items,
  devicePixelsPerUnit,
  engine,
  atlas
}: TextDrawListInput): TextDrawList => {
  const builder = createInstanceBuilder()
  items.forEach(({ node }) => {
    const layout =
      node.fontSize * devicePixelsPerUnit <= MAX_GLYPH_PIXELS_PER_EM
        ? engine.getNodeLayout(node)
        : undefined
    const isPlaced =
      layout !== undefined && placeNode(builder, node, layout, devicePixelsPerUnit, atlas)
    if (!isPlaced) builder.addFallback(node)
  })
  return builder.finish()
}
