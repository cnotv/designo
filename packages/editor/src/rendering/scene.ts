import { getPaintOrder, type DesignDocument, type DesignNode } from '@designo/core'
import { getClippingFrames } from '../editing/selection.ts'
import { searchSpatialIndex } from '../editing/spatialIndex.ts'
import type { SpatialIndex, Viewport } from '../editing/types.ts'
import type { CanvasSize, RgbaColor, SceneBatch, SceneItem, SceneSource } from './types.ts'

const HALF_TURN_DEGREES = 180
const CHANNEL_MAX = 255
const HEX_RADIX = 16
const DIGITS_PER_CHANNEL = 2
const HEX_LENGTH_WITH_ALPHA = 9
// A pixel of margin, so a node whose edge is anti-aliased into view is not culled.
const CULL_MARGIN_PIXELS = 2

/** Floats per shape instance, in the order `packShapeInstances` writes them. */
export const SHAPE_INSTANCE_FLOATS = 17

/**
 * Works out, once per document, what any scene of it needs: the spatial index and paint order.
 * @param document - The document.
 * @param index - The spatial index over what it draws.
 * @returns The source to build scenes from.
 */
export const createSceneSource = (document: DesignDocument, index: SpatialIndex): SceneSource => ({
  document,
  index,
  paintPosition: new Map(getPaintOrder(document).map((node, position) => [node.id, position]))
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
  const margin = CULL_MARGIN_PIXELS / viewport.scale
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
      return node ? [{ node, clipFrames: getClippingFrames(source.document, nodeId) }] : []
    })
}

const clipKey = (item: SceneItem): string => item.clipFrames.map((frame) => frame.id).join('/')

/**
 * Splits a scene into runs that one draw call can take: consecutive shapes under the same
 * clipping frames, and each text on its own until text has its own batched path.
 * @param items - The scene, back to front.
 * @returns The batches, back to front.
 */
export const batchScene = (items: readonly SceneItem[]): SceneBatch[] =>
  items.reduce<SceneBatch[]>((batches, item) => {
    const kind = item.node.type === 'text' ? 'text' : 'shapes'
    const last = batches.at(-1)
    const extendsLast =
      kind === 'shapes' &&
      last?.kind === 'shapes' &&
      clipKey(last.items[0] ?? item) === clipKey(item)
    if (!last || !extendsLast) return [...batches, { kind, items: [item] }]
    return [...batches.slice(0, -1), { kind, items: [...last.items, item] }]
  }, [])

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

const shapeInstance = (node: DesignNode): number[] => {
  const halfWidth = node.width / 2
  const halfHeight = node.height / 2
  const fill = parseHexColor(node.fill)
  const stroke = parseHexColor(node.stroke)
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

/**
 * Packs shapes into the instance buffer the WebGL2 shape shader reads: centre, half size,
 * rotation in radians, corner radius, kind (0 box, 1 ellipse), stroke width, opacity, fill and
 * stroke colour.
 * @param nodes - The shapes, back to front.
 * @returns `SHAPE_INSTANCE_FLOATS` floats per shape.
 */
export const packShapeInstances = (nodes: readonly DesignNode[]): Float32Array =>
  new Float32Array(nodes.flatMap(shapeInstance))
