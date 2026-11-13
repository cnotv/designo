import { getPaintOrder, type DesignDocument, type DesignNode } from '@designo/core'
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

const paintNode = (context: CanvasRenderingContext2D, node: DesignNode): void => {
  if (node.type === 'group') return
  context.save()
  context.globalAlpha = node.opacity
  context.translate(node.x, node.y)
  context.rotate((node.rotation * Math.PI) / 180)
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
  getPaintOrder(document).forEach((node) => paintNode(context, node))
  context.restore()
}
