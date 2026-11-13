import { getPaintOrder, type DesignDocument, type DesignNode } from '@designo/core'
import { getBoundsCenter } from '../editing/rotation.ts'
import { getClippingFrames } from '../editing/selection.ts'
import type { Viewport } from '../editing/types.ts'

const LINE_HEIGHT_RATIO = 1.25

const traceShape = (context: CanvasRenderingContext2D, node: DesignNode): void => {
  context.beginPath()
  if (node.type === 'ellipse') {
    context.ellipse(
      node.width / 2,
      node.height / 2,
      node.width / 2,
      node.height / 2,
      0,
      0,
      Math.PI * 2
    )
    return
  }
  context.roundRect(0, 0, node.width, node.height, node.cornerRadius)
}

const paintShape = (context: CanvasRenderingContext2D, node: DesignNode): void => {
  traceShape(context, node)
  if (node.fill) {
    context.fillStyle = node.fill
    context.fill()
  }
  if (node.stroke && node.strokeWidth > 0) {
    context.strokeStyle = node.stroke
    context.lineWidth = node.strokeWidth
    context.stroke()
  }
}

const paintText = (context: CanvasRenderingContext2D, node: DesignNode): void => {
  context.fillStyle = node.fill ?? '#000000'
  context.font = `${node.fontSize}px ${node.fontFamily}`
  context.textBaseline = 'top'
  node.text.split('\n').forEach((line, lineIndex) => {
    context.fillText(line, 0, lineIndex * node.fontSize * LINE_HEIGHT_RATIO)
  })
}

// Rotation turns a node around its centre, so its box stays where it is while the node spins.
const moveToNodeOrigin = (context: CanvasRenderingContext2D, node: DesignNode): void => {
  const center = getBoundsCenter(node)
  context.translate(center.x, center.y)
  context.rotate((node.rotation * Math.PI) / 180)
  context.translate(-node.width / 2, -node.height / 2)
}

// A clip stays until the surrounding save is restored, so the caller restores after painting.
const clipToFrame = (context: CanvasRenderingContext2D, frame: DesignNode): void => {
  const worldTransform = context.getTransform()
  moveToNodeOrigin(context, frame)
  traceShape(context, frame)
  context.setTransform(worldTransform)
  context.clip()
}

const paintNode = (
  context: CanvasRenderingContext2D,
  document: DesignDocument,
  node: DesignNode
): void => {
  if (node.type === 'group') return
  context.save()
  getClippingFrames(document, node.id).forEach((frame) => clipToFrame(context, frame))
  context.globalAlpha = node.opacity
  moveToNodeOrigin(context, node)
  if (node.type === 'text') paintText(context, node)
  else paintShape(context, node)
  context.restore()
}

/**
 * Draws a document onto a 2D canvas. A stopgap until the WebGL renderer exists (phase 1).
 * @param context - The canvas to draw on, already cleared and sized.
 * @param document - The document to draw.
 * @param viewport - Pan and zoom to apply.
 */
export const drawDocument = (
  context: CanvasRenderingContext2D,
  document: DesignDocument,
  viewport: Viewport
): void => {
  context.save()
  context.translate(viewport.offsetX, viewport.offsetY)
  context.scale(viewport.scale, viewport.scale)
  getPaintOrder(document).forEach((node) => paintNode(context, document, node))
  context.restore()
}
