import {
  DEFAULT_NODE_PROPERTIES,
  getPathBox,
  getSubtreeIds,
  type DesignDocument,
  type DesignNode,
  type DesignNodePatch,
  type DesignOperation
} from '@designo/core'
import { boundsFromPoints, estimateTextSize } from './geometry.ts'
import { getBoundsCenter, normalizeRotation, resizeRotatedBounds, rotatePoint } from './rotation.ts'
import { getTopmostIds } from './selection.ts'
import type {
  Bounds,
  DrawingTool,
  DrawRequest,
  Point,
  ResizeHandle,
  TextBoxMeasurer
} from './types.ts'

const DEFAULT_SHAPE_SIZE = 100
const DRAG_THRESHOLD = 2
const DEFAULT_TEXT = 'Text'
const DEFAULT_FONT_SIZE = 16

const FILL_BY_TOOL: Record<Exclude<DrawingTool, 'text' | 'line'>, string> = {
  frame: '#ffffff',
  rectangle: '#d9d9d9',
  ellipse: '#d9d9d9'
}

const NAME_BY_TOOL: Record<DrawingTool, string> = {
  frame: 'Frame',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  line: 'Line'
}

const LINE_STROKE = '#000000'
const LINE_STROKE_WIDTH = 2
const ANGLE_STEP = Math.PI / 4

/**
 * Builds the updates that move nodes by a distance. Coordinates are absolute, so everything a
 * moved frame holds moves with it.
 * @param document - The document.
 * @param nodeIds - The nodes to move.
 * @param deltaX - Horizontal distance in world units.
 * @param deltaY - Vertical distance in world units.
 * @returns One update per moved node; none when the distance is zero.
 */
export const createMoveOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  deltaX: number,
  deltaY: number
): DesignOperation[] => {
  if (deltaX === 0 && deltaY === 0) return []
  const movedIds = [
    ...new Set(
      getTopmostIds(document, nodeIds).flatMap((nodeId) => getSubtreeIds(document, nodeId))
    )
  ]
  return movedIds.flatMap((nodeId) => {
    const node = document.nodes[nodeId]
    if (!node || node.type === 'page') return []
    return [
      { kind: 'update' as const, id: nodeId, patch: { x: node.x + deltaX, y: node.y + deltaY } }
    ]
  })
}

/**
 * Builds the update that resizes a node by dragging a handle.
 * @param nodeId - The node.
 * @param startBounds - Its box when the drag began, before rotation.
 * @param rotation - Its rotation, so the drag follows the node's own axes.
 * @param handle - The handle being dragged.
 * @param delta - How far the pointer moved, in world units.
 * @returns The update.
 */
export const createResizeOperations = (
  nodeId: string,
  startBounds: Bounds,
  rotation: number,
  handle: ResizeHandle,
  delta: Point
): DesignOperation[] => [
  {
    kind: 'update',
    id: nodeId,
    patch: resizeRotatedBounds(startBounds, rotation, handle, delta)
  }
]

/**
 * Builds the updates that rotate a node to an angle. What the node holds turns with it around
 * the node's centre, because children keep absolute coordinates and would otherwise be left behind.
 * @param document - The document, as it was before the rotation.
 * @param nodeId - The node being rotated.
 * @param rotation - The new rotation in degrees.
 * @returns One update per node that turns; none when the angle is unchanged.
 */
export const createRotateOperations = (
  document: DesignDocument,
  nodeId: string,
  rotation: number
): DesignOperation[] => {
  const node = document.nodes[nodeId]
  if (!node || rotation === node.rotation) return []
  const delta = rotation - node.rotation
  const pivot = getBoundsCenter(node)
  const descendantUpdates = getSubtreeIds(document, nodeId).flatMap((id): DesignOperation[] => {
    const descendant = document.nodes[id]
    if (!descendant || id === nodeId) return []
    const center = rotatePoint(getBoundsCenter(descendant), pivot, delta)
    return [
      {
        kind: 'update',
        id,
        patch: {
          x: center.x - descendant.width / 2,
          y: center.y - descendant.height / 2,
          rotation: normalizeRotation(descendant.rotation + delta)
        }
      }
    ]
  })
  return [{ kind: 'update', id: nodeId, patch: { rotation } }, ...descendantUpdates]
}

const drawnBounds = (start: Point, current: Point, keepSquare: boolean): Bounds => {
  const box = boundsFromPoints(start, current)
  if (box.width < DRAG_THRESHOLD && box.height < DRAG_THRESHOLD) {
    return { x: start.x, y: start.y, width: DEFAULT_SHAPE_SIZE, height: DEFAULT_SHAPE_SIZE }
  }
  if (!keepSquare) return box
  const side = Math.max(box.width, box.height)
  return {
    x: current.x < start.x ? start.x - side : start.x,
    y: current.y < start.y ? start.y - side : start.y,
    width: side,
    height: side
  }
}

// A click without a drag gives a line of the default length along the x axis; shift snaps the
// direction to a multiple of 45 degrees, keeping the length.
const lineEnd = (start: Point, current: Point, keepAngle: boolean): Point => {
  const dx = current.x - start.x
  const dy = current.y - start.y
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return { x: start.x + DEFAULT_SHAPE_SIZE, y: start.y }
  if (!keepAngle) return current
  const length = Math.hypot(dx, dy)
  const angle = Math.round(Math.atan2(dy, dx) / ANGLE_STEP) * ANGLE_STEP
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length }
}

/**
 * Builds the create operation for a shape or text the user is drawing.
 * @param drawing - What is being drawn, where, and whether shift keeps it square; a click without
 * a drag gives a default size.
 * @returns The create operation.
 */
export const createDrawOperation = ({
  tool,
  nodeId,
  parentId,
  start,
  current,
  keepSquare
}: DrawRequest): DesignOperation => {
  if (tool === 'text') {
    const size = estimateTextSize(
      DEFAULT_TEXT,
      DEFAULT_FONT_SIZE,
      DEFAULT_NODE_PROPERTIES.lineHeight
    )
    const properties: DesignNodePatch = {
      name: NAME_BY_TOOL.text,
      x: start.x,
      y: start.y,
      ...size,
      text: DEFAULT_TEXT,
      fontSize: DEFAULT_FONT_SIZE,
      fill: '#000000'
    }
    return { kind: 'create', id: nodeId, type: 'text', parentId, properties }
  }
  if (tool === 'line') {
    const end = lineEnd(start, current, keepSquare)
    const properties: DesignNodePatch = {
      ...getPathBox(`M${start.x},${start.y}L${end.x},${end.y}`),
      name: NAME_BY_TOOL.line,
      fill: null,
      stroke: LINE_STROKE,
      strokeWidth: LINE_STROKE_WIDTH
    }
    return { kind: 'create', id: nodeId, type: 'path', parentId, properties }
  }
  return {
    kind: 'create',
    id: nodeId,
    type: tool,
    parentId,
    properties: {
      name: NAME_BY_TOOL[tool],
      ...drawnBounds(start, current, keepSquare),
      fill: FILL_BY_TOOL[tool]
    }
  }
}

/**
 * Builds the deletes for a selection, skipping anything inside another selected node.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @returns One delete per outermost selected node.
 */
export const createDeleteOperations = (
  document: DesignDocument,
  nodeIds: readonly string[]
): DesignOperation[] =>
  getTopmostIds(document, nodeIds)
    .filter((nodeId) => nodeId !== document.rootId && document.nodes[nodeId])
    .map((nodeId) => ({ kind: 'delete', id: nodeId }))

// A width typed into a text node is where its lines wrap, so it changes the box's height too.
const TEXT_BOX_PROPERTIES = [
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textWrap',
  'spans',
  'listStyle',
  'listIndent',
  'width'
] as const

const changesTextBox = (patch: DesignNodePatch): boolean =>
  TEXT_BOX_PROPERTIES.some((property) => property in patch)

// The line height changes how tall the lines stand, never how wide they are.
const WIDTH_PROPERTIES = [
  'text',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'textWrap',
  'spans',
  'listStyle',
  'listIndent'
] as const

// A fixed-width box keeps the width it was given and only grows taller, as tall as its words
// wrap to; an auto-width box follows its words in both directions.
const fitTextBox = (
  node: DesignNode,
  patch: DesignNodePatch,
  isFixedWidth: boolean,
  measureTextBox: TextBoxMeasurer
): DesignNodePatch => {
  const next = { ...node, ...patch }
  const { width, height } = measureTextBox({
    text: next.text,
    fontFamily: next.fontFamily,
    fontWeight: next.fontWeight,
    fontStyle: next.fontStyle,
    letterSpacing: next.letterSpacing,
    fontSize: next.fontSize,
    lineHeight: next.lineHeight,
    textAlign: next.textAlign,
    wrapWidth: isFixedWidth ? next.width : undefined,
    spans: next.spans,
    listStyle: next.listStyle,
    listIndent: next.listIndent
  })
  const followsWords = !isFixedWidth && WIDTH_PROPERTIES.some((property) => property in patch)
  return followsWords
    ? { width: Math.ceil(width), height: Math.ceil(height) }
    : { height: Math.ceil(height) }
}

/**
 * Builds the update for a property edit, keeping a text node's box in step with its words. A
 * width typed into a text node makes it a fixed-width box, because an auto-width box would give
 * the number back the next time its words changed.
 * @param document - The document.
 * @param nodeId - The node being edited.
 * @param patch - The changed properties.
 * @param measureTextBox - Sizes a text box: the shaped layout in the app, an estimate in tests.
 * @returns The update, or none when the node is gone.
 */
export const createPropertyOperations = (
  document: DesignDocument,
  nodeId: string,
  patch: DesignNodePatch,
  measureTextBox: TextBoxMeasurer
): DesignOperation[] => {
  const node = document.nodes[nodeId]
  if (!node) return []
  if (node.type !== 'text') return [{ kind: 'update', id: nodeId, patch }]
  const setsWidth = 'width' in patch && !('textWrap' in patch)
  const typedPatch: DesignNodePatch = setsWidth ? { ...patch, textWrap: true } : patch
  const isFixedWidth = typedPatch.textWrap ?? node.textWrap
  const size = changesTextBox(patch)
    ? fitTextBox(node, typedPatch, isFixedWidth, measureTextBox)
    : {}
  return [{ kind: 'update', id: nodeId, patch: { ...typedPatch, ...size } }]
}
