import type { DesignDocument } from '@designo/core'
import { getHandlePositions, getNodeBounds, unionBounds } from '../editing/geometry.ts'
import type { Bounds, Viewport } from '../editing/types.ts'
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

const drawHandles = (context: CanvasRenderingContext2D, box: Bounds): void => {
  context.fillStyle = '#ffffff'
  getHandlePositions(box).forEach(({ point }) => {
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
    strokeScreenRect(context, toScreenBounds(viewport, getNodeBounds(hovered)))
  }
  const selectedBoxes = overlay.selection.flatMap((nodeId) => {
    const node = document.nodes[nodeId]
    return node ? [getNodeBounds(node)] : []
  })
  selectedBoxes.forEach((box) => strokeScreenRect(context, toScreenBounds(viewport, box)))
  const selectionBox = unionBounds(selectedBoxes)
  if (selectionBox) {
    const screenBox = toScreenBounds(viewport, selectionBox)
    if (selectedBoxes.length > 1) strokeScreenRect(context, screenBox)
    if (overlay.showHandles) drawHandles(context, screenBox)
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
