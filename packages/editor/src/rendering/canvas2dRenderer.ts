import type { DesignNode } from '@designo/core'
import { getBoundsCenter } from '../editing/rotation.ts'
import { paintText } from './fallbackText.ts'
import { prepareCanvas } from './prepareCanvas.ts'
import type { Scene, SceneItem, SceneRenderer } from './types.ts'

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

const paintSceneItem = (
  context: CanvasRenderingContext2D,
  { node, clipFrames }: SceneItem
): void => {
  if (node.type === 'group') return
  context.save()
  clipFrames.forEach((frame) => clipToFrame(context, frame))
  context.globalAlpha = node.opacity
  moveToNodeOrigin(context, node)
  if (node.type === 'text') paintText(context, node)
  else paintShape(context, node)
  context.restore()
}

/**
 * Makes the Canvas 2D renderer: the fallback where WebGL2 is not available.
 * @param canvas - The canvas to draw on.
 * @returns The renderer, or undefined when the canvas has no 2D context.
 */
export const createCanvas2dRenderer = (canvas: HTMLCanvasElement): SceneRenderer | undefined => {
  const context = canvas.getContext('2d')
  if (!context) return undefined
  return {
    kind: 'canvas2d',
    render: (scene: Scene) => {
      prepareCanvas(canvas, scene.size, scene.pixelRatio)
      context.setTransform(scene.pixelRatio, 0, 0, scene.pixelRatio, 0, 0)
      context.clearRect(0, 0, scene.size.width, scene.size.height)
      context.translate(scene.viewport.offsetX, scene.viewport.offsetY)
      context.scale(scene.viewport.scale, scene.viewport.scale)
      scene.items.forEach((item) => paintSceneItem(context, item))
    },
    dispose: () => undefined
  }
}
