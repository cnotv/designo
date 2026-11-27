import {
  BLEND_MODES,
  getEffectReach,
  getFillGradient,
  getPaintOrder,
  hasLayerEffects,
  type DesignDocument,
  type DesignNode,
  type Gradient
} from '@designo/core'
import { getClippingFrames } from '../editing/selection.ts'
import { searchSpatialIndex } from '../editing/spatialIndex.ts'
import type { SpatialIndex, Viewport } from '../editing/types.ts'
import { getPageGuideItems } from './pageGuideItems.ts'
import type { CanvasSize, RgbaColor, SceneBatch, SceneItem, SceneSource } from './types.ts'

const HALF_TURN_DEGREES = 180
const CHANNEL_MAX = 255
const HEX_RADIX = 16
const DIGITS_PER_CHANNEL = 2
const HEX_LENGTH_WITH_ALPHA = 9
// A pixel of margin, so a node whose edge is anti-aliased into view is not culled.
const CULL_MARGIN_PIXELS = 2

/** Floats per shape instance, in the order `packShapeInstances` writes them. */
export const SHAPE_INSTANCE_FLOATS = 29

// What the shader reads for a gradient's kind: 0 is the solid fill.
const GRADIENT_KIND_CODES = { linear: 1, radial: 2 } as const

/** Gives a gradient its row in the ramp texture, which the shader looks its colours up in. */
export type RampRowOf = (gradient: Gradient) => number

/**
 * Works out, once per document, what any scene of it needs: the spatial index and paint order.
 * @param document - The document.
 * @param index - The spatial index over what it draws.
 * @returns The source to build scenes from.
 */
export const createSceneSource = (document: DesignDocument, index: SpatialIndex): SceneSource => ({
  document,
  index,
  paintPosition: new Map(getPaintOrder(document).map((node, position) => [node.id, position])),
  maxEffectReach: Math.max(0, ...Object.values(document.nodes).map(getEffectReach))
})

/**
 * Lists what to draw for a viewport: the nodes the spatial index finds in view, in paint order,
 * each with the frames that clip it. Nodes outside the view are never submitted.
 * @param source - The document's scene source.
 * @param viewport - Pan and zoom.
 * @param size - The canvas size in CSS pixels.
 * @param hiddenNodeId - A node to leave out, because an overlay is editing it.
 * @returns The items to draw, back to front.
 */
export const buildScene = (
  source: SceneSource,
  viewport: Viewport,
  size: CanvasSize,
  hiddenNodeId?: string
): SceneItem[] => {
  const margin = CULL_MARGIN_PIXELS / viewport.scale + source.maxEffectReach
  const area = {
    x: -viewport.offsetX / viewport.scale - margin,
    y: -viewport.offsetY / viewport.scale - margin,
    width: size.width / viewport.scale + margin * 2,
    height: size.height / viewport.scale + margin * 2
  }
  const paintPositionOf = (nodeId: string): number => source.paintPosition.get(nodeId) ?? 0
  return searchSpatialIndex(source.index, area)
    .filter((nodeId) => nodeId !== hiddenNodeId)
    .toSorted((first, second) => paintPositionOf(first) - paintPositionOf(second))
    .flatMap((nodeId) => {
      const node = source.document.nodes[nodeId]
      if (!node) return []
      const item = { node, clipFrames: getClippingFrames(source.document, nodeId) }
      return [item, ...getPageGuideItems(item, viewport.scale)]
    })
}

const isBlended = (node: DesignNode): boolean =>
  hasLayerEffects(node) && node.blendMode !== 'normal'

const batchKindOf = (node: DesignNode): SceneBatch['kind'] => {
  if (node.type === 'text') return 'text'
  if (node.type === 'path') return 'path'
  return node.type === 'image' ? 'image' : 'shapes'
}

const clipKey = (item: SceneItem): string => item.clipFrames.map((frame) => frame.id).join('/')

/**
 * Splits a scene into runs that one draw call can take: consecutive shapes under the same
 * clipping frames, consecutive texts under the same clipping frames, which draw together from
 * the glyph atlas, and consecutive images, each drawn from a texture of its own.
 * @param items - The scene, back to front.
 * @returns The batches, back to front.
 */
export const batchScene = (items: readonly SceneItem[]): SceneBatch[] => {
  // Built in one pass over the items, because a scene can hold thousands and copying a growing
  // batch for each would be quadratic.
  const batches: {
    kind: SceneBatch['kind']
    items: SceneItem[]
    clip: string
    blended: boolean
  }[] = []
  items.forEach((item) => {
    const kind = batchKindOf(item.node)
    const clip = clipKey(item)
    const blended = isBlended(item.node)
    const last = batches.at(-1)
    if (last?.kind === kind && last.clip === clip && !last.blended && !blended) {
      last.items.push(item)
      return
    }
    batches.push({ kind, items: [item], clip, blended })
  })
  return batches
}

// Channel 0 is red; the leading # takes the first character.
const channel = (hex: string, channelIndex: number): number => {
  const start = 1 + channelIndex * DIGITS_PER_CHANNEL
  return Number.parseInt(hex.slice(start, start + DIGITS_PER_CHANNEL), HEX_RADIX) / CHANNEL_MAX
}

/**
 * Reads a stored colour into channels from 0 to 1.
 * @param hex - `#rrggbb` or `#rrggbbaa`, already validated by the document schema, or null.
 * @returns The colour; null reads as fully transparent.
 */
export const parseHexColor = (hex: string | null): RgbaColor => {
  if (!hex) return { red: 0, green: 0, blue: 0, alpha: 0 }
  return {
    red: channel(hex, 0),
    green: channel(hex, 1),
    blue: channel(hex, 2),
    alpha: hex.length === HEX_LENGTH_WITH_ALPHA ? channel(hex, 3) : 1
  }
}

const gradientFields = (node: DesignNode, rampRowOf: RampRowOf): number[] => {
  const gradient = getFillGradient(node)
  if (!gradient) return [0, 0, 0]
  return [
    GRADIENT_KIND_CODES[gradient.kind],
    (gradient.angle * Math.PI) / HALF_TURN_DEGREES,
    rampRowOf(gradient)
  ]
}

const shadowFields = (node: DesignNode): number[] => {
  const shadow = node.shadow
  if (!shadow) return [0, 0, 0, 0, 0, 0, 0]
  const { red, green, blue, alpha } = parseHexColor(shadow.color)
  return [shadow.x, shadow.y, shadow.blur, red, green, blue, alpha]
}

// Blur, gradient, shadow and blend mode: the last twelve floats of an instance, where the shadow's
// colour follows its blend mode so the shader reads them as two vec4s.
const effectFields = (node: DesignNode, rampRowOf: RampRowOf): number[] => {
  const effects = hasLayerEffects(node)
  const [shadowX, shadowY, shadowBlur, ...shadowColor] = effects
    ? shadowFields(node)
    : shadowFields({ ...node, shadow: null })
  return [
    effects ? node.blur : 0,
    ...gradientFields(node, rampRowOf),
    shadowX ?? 0,
    shadowY ?? 0,
    shadowBlur ?? 0,
    effects ? BLEND_MODES.indexOf(node.blendMode) : 0,
    ...shadowColor
  ]
}

const colorFields = (node: DesignNode): number[] => {
  const fill = parseHexColor(node.fill)
  const stroke = parseHexColor(node.stroke)
  return [
    fill.red,
    fill.green,
    fill.blue,
    fill.alpha,
    stroke.red,
    stroke.green,
    stroke.blue,
    stroke.alpha
  ]
}

const shapeInstance = (node: DesignNode, rampRowOf: RampRowOf): number[] => {
  const halfWidth = node.width / 2
  const halfHeight = node.height / 2
  const strokeWidth = node.stroke ? node.strokeWidth : 0
  return [
    node.x + halfWidth,
    node.y + halfHeight,
    halfWidth,
    halfHeight,
    (node.rotation * Math.PI) / HALF_TURN_DEGREES,
    // Canvas 2D shrinks a radius that does not fit the box; the shader expects the same.
    Math.min(node.cornerRadius, halfWidth, halfHeight),
    node.type === 'ellipse' ? 1 : 0,
    strokeWidth,
    node.opacity,
    ...colorFields(node),
    ...effectFields(node, rampRowOf)
  ]
}

/**
 * Packs shapes into the instance buffer the WebGL2 shape shader reads: centre, half size,
 * rotation in radians, corner radius, kind (0 box, 1 ellipse), stroke width, opacity, fill and
 * stroke colour, then blur, gradient kind, angle and ramp row, shadow offset and blur, blend mode
 * index, and shadow colour.
 * @param nodes - The shapes, back to front.
 * @param rampRowOf - Where each gradient's colours are in the ramp texture.
 * @returns `SHAPE_INSTANCE_FLOATS` floats per shape.
 */
export const packShapeInstances = (
  nodes: readonly DesignNode[],
  rampRowOf: RampRowOf = () => 0
): Float32Array => new Float32Array(nodes.flatMap((node) => shapeInstance(node, rampRowOf)))
