import { getFillGradient, getGradientLine, hasLayerEffects, type DesignNode } from '@designo/core'
import { getBoundsCenter } from '../editing/rotation.ts'
import { paintText } from './fallbackText.ts'
import { getLoadedImage } from './imageCache.ts'
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

const makeGradientStyle = (
  context: CanvasRenderingContext2D,
  node: DesignNode
): CanvasGradient | undefined => {
  const gradient = getFillGradient(node)
  if (!gradient) return undefined
  const style =
    gradient.kind === 'radial'
      ? context.createRadialGradient(0, 0, 0, 0, 0, 1)
      : (() => {
          const line = getGradientLine(node, gradient)
          return context.createLinearGradient(line.startX, line.startY, line.endX, line.endY)
        })()
  gradient.stops.forEach((stop) => style.addColorStop(stop.offset, stop.color))
  return style
}

// A radial gradient is made as a unit circle and stretched to the box when it paints, so an
// ellipse gets an elliptical gradient. The path was traced before the stretch and is not moved.
const fillWithGradient = (context: CanvasRenderingContext2D, node: DesignNode): void => {
  const style = makeGradientStyle(context, node)
  if (!style) return
  context.save()
  if (getFillGradient(node)?.kind === 'radial') {
    context.translate(node.width / 2, node.height / 2)
    context.scale(node.width / 2, node.height / 2)
  }
  context.fillStyle = style
  context.fill()
  context.restore()
}

// Shadow offsets and blurs are in device pixels, never turned or scaled with the canvas, so
// they are worked out for the node's turn and the view's zoom.
const applyShadow = (
  context: CanvasRenderingContext2D,
  node: DesignNode,
  devicePixelsPerUnit: number
): void => {
  if (!node.shadow) return
  const radians = (node.rotation * Math.PI) / 180
  const { x, y, blur, color } = node.shadow
  context.shadowColor = color
  context.shadowBlur = blur * 2 * devicePixelsPerUnit
  context.shadowOffsetX = (x * Math.cos(radians) - y * Math.sin(radians)) * devicePixelsPerUnit
  context.shadowOffsetY = (x * Math.sin(radians) + y * Math.cos(radians)) * devicePixelsPerUnit
}

const paintShape = (
  context: CanvasRenderingContext2D,
  node: DesignNode,
  devicePixelsPerUnit: number
): void => {
  const effects = hasLayerEffects(node)
  if (effects) {
    context.globalCompositeOperation = node.blendMode === 'normal' ? 'source-over' : node.blendMode
    // ponytail: the fallback blurs the shadow along with the shape, and does not blur on Safari
    // versions without canvas filters; the WebGL path is the reference.
    if (node.blur > 0) context.filter = `blur(${node.blur * devicePixelsPerUnit}px)`
    applyShadow(context, node, devicePixelsPerUnit)
  }
  traceShape(context, node)
  if (getFillGradient(node)) fillWithGradient(context, node)
  else if (node.fill) {
    context.fillStyle = node.fill
    context.fill()
  }
  context.shadowColor = 'transparent'
  if (node.stroke && node.strokeWidth > 0) {
    context.strokeStyle = node.stroke
    context.lineWidth = node.strokeWidth
    context.stroke()
  }
}

// A picture still loading draws as its fill, which the shape path paints.
const paintImage = (
  context: CanvasRenderingContext2D,
  node: DesignNode,
  devicePixelsPerUnit: number
): void => {
  const picture = node.imageAsset ? getLoadedImage(node.imageAsset) : undefined
  if (picture) context.drawImage(picture, 0, 0, node.width, node.height)
  else paintShape(context, node, devicePixelsPerUnit)
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
  { node, clipFrames }: SceneItem,
  devicePixelsPerUnit: number
): void => {
  if (node.type === 'group') return
  context.save()
  clipFrames.forEach((frame) => clipToFrame(context, frame))
  context.globalAlpha = node.opacity
  moveToNodeOrigin(context, node)
  if (node.type === 'text') paintText(context, node)
  else if (node.type === 'image') paintImage(context, node, devicePixelsPerUnit)
  else paintShape(context, node, devicePixelsPerUnit)
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
      const devicePixelsPerUnit = scene.viewport.scale * scene.pixelRatio
      scene.items.forEach((item) => paintSceneItem(context, item, devicePixelsPerUnit))
    },
    dispose: () => undefined
  }
}
