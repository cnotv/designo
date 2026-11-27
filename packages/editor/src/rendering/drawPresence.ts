import type { DesignDocument } from '@designo/core'
import { getNodeBounds } from '../editing/geometry.ts'
import { getRotatedCorners } from '../editing/rotation.ts'
import type { Point, RemoteMark, Viewport } from '../editing/types.ts'
import { worldToScreen } from '../editing/viewport.ts'

const REMOTE_OUTLINE_WIDTH = 2
const LABEL_FONT = '600 11px system-ui, sans-serif'
const LABEL_HEIGHT = 18
const LABEL_PADDING = 6
const LABEL_OFFSET = 14
const LABEL_RADIUS = 4
const LABEL_TEXT_BASELINE = 13
// The pointer is drawn as an arrow, its tip on the point, in design-independent pixels.
const ARROW: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: 14 },
  { x: 4, y: 10.5 },
  { x: 7, y: 16 },
  { x: 9, y: 15 },
  { x: 6.5, y: 9.5 },
  { x: 11, y: 9.5 }
]

const traceOutline = (context: CanvasRenderingContext2D, corners: readonly Point[]): void => {
  context.beginPath()
  corners.forEach((corner, index) => {
    if (index === 0) context.moveTo(corner.x, corner.y)
    else context.lineTo(corner.x, corner.y)
  })
  context.closePath()
  context.stroke()
}

const drawNameTag = (context: CanvasRenderingContext2D, mark: RemoteMark, at: Point): void => {
  context.font = LABEL_FONT
  const width = context.measureText(mark.name).width + LABEL_PADDING * 2
  context.fillStyle = mark.color
  context.beginPath()
  context.roundRect(at.x, at.y, width, LABEL_HEIGHT, LABEL_RADIUS)
  context.fill()
  context.fillStyle = '#ffffff'
  context.fillText(mark.name, at.x + LABEL_PADDING, at.y + LABEL_TEXT_BASELINE)
}

const drawPointer = (context: CanvasRenderingContext2D, mark: RemoteMark, tip: Point): void => {
  context.fillStyle = mark.color
  context.strokeStyle = '#ffffff'
  context.lineWidth = 1
  context.beginPath()
  ARROW.forEach((point, index) => {
    if (index === 0) context.moveTo(tip.x + point.x, tip.y + point.y)
    else context.lineTo(tip.x + point.x, tip.y + point.y)
  })
  context.closePath()
  context.fill()
  context.stroke()
  drawNameTag(context, mark, { x: tip.x + LABEL_OFFSET, y: tip.y + LABEL_OFFSET })
}

/**
 * Draws the others on the file: an outline in their colour around what each has selected, and
 * their pointer with their name.
 * @param context - The overlay canvas, set to CSS pixels.
 * @param document - The shown page.
 * @param viewport - Pan and zoom.
 * @param marks - The others' selections and pointers.
 */
export const drawPresence = (
  context: CanvasRenderingContext2D,
  document: DesignDocument,
  viewport: Viewport,
  marks: readonly RemoteMark[]
): void => {
  context.save()
  marks.forEach((mark) => {
    context.strokeStyle = mark.color
    context.lineWidth = REMOTE_OUTLINE_WIDTH
    mark.selection.forEach((nodeId) => {
      const node = document.nodes[nodeId]
      if (!node) return
      const corners = getRotatedCorners(getNodeBounds(node), node.rotation).map((corner) =>
        worldToScreen(viewport, corner)
      )
      traceOutline(context, corners)
    })
    if (mark.cursor) drawPointer(context, mark, worldToScreen(viewport, mark.cursor))
  })
  context.restore()
}
