import type { DesignDocument, DesignNode } from '@designo/core'
import { getNodeBounds, unionBounds } from '../editing/geometry.ts'
import { getRotatedCorners, getRotatedHandlePositions } from '../editing/rotation.ts'
import type { Bounds, Point, Viewport } from '../editing/types.ts'
import { worldToScreen } from '../editing/viewport.ts'
import type { OverlayState } from './types.ts'

const HANDLE_SIZE = 8
const SIZE_LABEL_GAP = 8
const SIZE_LABEL_HEIGHT = 18
const SIZE_LABEL_PADDING = 6
const MARQUEE_FILL_ALPHA = 0.08
const PIXEL_CENTER = 0.5

const toScreenBounds = (viewport: Viewport, bounds: Bounds): Bounds => {
  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y })
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bounds.width * viewport.scale,
    height: bounds.height * viewport.scale
  }
}

// Half-pixel offsets keep one-pixel lines crisp instead of smeared over two pixels.
const strokeScreenRect = (context: CanvasRenderingContext2D, box: Bounds): void => {
  context.strokeRect(
    Math.round(box.x) + PIXEL_CENTER,
    Math.round(box.y) + PIXEL_CENTER,
    Math.round(box.width),
    Math.round(box.height)
  )
}

// Outlines follow the node's rotation, so they are traced corner to corner rather than as a box.
const strokeScreenPolygon = (
  context: CanvasRenderingContext2D,
  corners: readonly Point[]
): void => {
  context.beginPath()
  corners.forEach((corner, index) => {
    const x = Math.round(corner.x) + PIXEL_CENTER
    const y = Math.round(corner.y) + PIXEL_CENTER
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.closePath()
  context.stroke()
}

const toScreenCorners = (viewport: Viewport, node: DesignNode): Point[] =>
  getRotatedCorners(getNodeBounds(node), node.rotation).map((corner) =>
    worldToScreen(viewport, corner)
  )

const boundsOfPoints = (points: readonly Point[]): Bounds => {
  const left = Math.min(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  return {
    x: left,
    y: top,
    width: Math.max(...points.map((point) => point.x)) - left,
    height: Math.max(...points.map((point) => point.y)) - top
  }
}

const drawHandles = (context: CanvasRenderingContext2D, points: readonly Point[]): void => {
  context.fillStyle = '#ffffff'
  points.forEach((point) => {
    const left = Math.round(point.x - HANDLE_SIZE / 2) + PIXEL_CENTER
    const top = Math.round(point.y - HANDLE_SIZE / 2) + PIXEL_CENTER
    context.fillRect(left, top, HANDLE_SIZE, HANDLE_SIZE)
    context.strokeRect(left, top, HANDLE_SIZE, HANDLE_SIZE)
  })
}

const drawSizeLabel = (
  context: CanvasRenderingContext2D,
  worldBox: Bounds,
  screenBox: Bounds,
  color: string
): void => {
  const label = `${Math.round(worldBox.width)} × ${Math.round(worldBox.height)}`
  context.font = '11px Inter, system-ui, sans-serif'
  const width = context.measureText(label).width + SIZE_LABEL_PADDING * 2
  const left = screenBox.x + screenBox.width / 2 - width / 2
  const top = screenBox.y + screenBox.height + SIZE_LABEL_GAP
  context.fillStyle = color
  context.beginPath()
  context.roundRect(left, top, width, SIZE_LABEL_HEIGHT, 3)
  context.fill()
  context.fillStyle = '#ffffff'
  context.textBaseline = 'middle'
  context.fillText(label, left + SIZE_LABEL_PADDING, top + SIZE_LABEL_HEIGHT / 2)
}

/**
 * Draws the editor's marks over the document in screen space: hover and selection outlines,
 * resize handles, the size of the selection and the marquee.
 * @param context - The canvas, already drawn with the document, in CSS pixel units.
 * @param document - The document as shown, previews included.
 * @param viewport - Pan and zoom.
 * @param overlay - What to mark.
 */
export const drawOverlay = (
  context: CanvasRenderingContext2D,
  document: DesignDocument,
  viewport: Viewport,
  overlay: OverlayState
): void => {
  context.save()
  context.strokeStyle = overlay.color
  context.lineWidth = 1
  const hovered = overlay.hoveredId ? document.nodes[overlay.hoveredId] : undefined
  if (hovered && !overlay.selection.includes(hovered.id)) {
    strokeScreenPolygon(context, toScreenCorners(viewport, hovered))
  }
  const selectedNodes = overlay.selection.flatMap((nodeId) => {
    const node = document.nodes[nodeId]
    return node ? [node] : []
  })
  const selectedCorners = selectedNodes.map((node) => toScreenCorners(viewport, node))
  selectedCorners.forEach((corners) => strokeScreenPolygon(context, corners))
  const [single] = selectedNodes
  if (selectedNodes.length === 1 && single) {
    const screenBox = boundsOfPoints(selectedCorners.flat())
    if (overlay.showHandles) {
      drawHandles(
        context,
        getRotatedHandlePositions(getNodeBounds(single), single.rotation).map(({ point }) =>
          worldToScreen(viewport, point)
        )
      )
    }
    drawSizeLabel(context, getNodeBounds(single), screenBox, overlay.color)
  }
  const selectionBox = unionBounds(selectedNodes.map((node) => getNodeBounds(node)))
  if (selectedNodes.length > 1 && selectionBox) {
    const screenBox = boundsOfPoints(selectedCorners.flat())
    strokeScreenRect(context, screenBox)
    drawSizeLabel(context, selectionBox, screenBox, overlay.color)
  }
  if (overlay.marquee) {
    const screenBox = toScreenBounds(viewport, overlay.marquee)
    context.globalAlpha = MARQUEE_FILL_ALPHA
    context.fillStyle = overlay.color
    context.fillRect(screenBox.x, screenBox.y, screenBox.width, screenBox.height)
    context.globalAlpha = 1
    strokeScreenRect(context, screenBox)
  }
  context.restore()
}
