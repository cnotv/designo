import type { DesignNode, Gradient } from './types.ts'

const DEGREES_TO_RADIANS = Math.PI / 180

/** A blurred edge fades out within this many standard deviations, and reaches no further. */
export const BLUR_REACH_IN_SIGMAS = 3

/** A gradient's axis in the node's own space, whose origin is the top-left corner of its box. */
export interface GradientLine {
  startX: number
  startY: number
  endX: number
  endY: number
}

/**
 * How far past its box a node paints because of its blur and shadow, so a renderer or an export
 * does not cut a soft edge short.
 * @param node - The node to measure.
 * @returns The distance in world units, 0 for a node with neither effect.
 */
export const getEffectReach = (node: DesignNode): number =>
  !hasLayerEffects(node)
    ? 0
    : Math.max(
        node.blur * BLUR_REACH_IN_SIGMAS,
        node.shadow
          ? Math.hypot(node.shadow.x, node.shadow.y) + node.shadow.blur * BLUR_REACH_IN_SIGMAS
          : 0
      )

/**
 * Where a linear gradient starts and ends: through the centre of the box along its angle, as long
 * as the box is across that direction, so the first stop touches one corner and the last touches
 * the opposite one.
 * @param node - The node the gradient fills.
 * @param gradient - The gradient, whose `angle` is in degrees clockwise from pointing right.
 * @returns The line, in the node's own space.
 */
export const getGradientLine = (node: DesignNode, gradient: Gradient): GradientLine => {
  const radians = gradient.angle * DEGREES_TO_RADIANS
  const directionX = Math.cos(radians)
  const directionY = Math.sin(radians)
  const halfLength = (Math.abs(node.width * directionX) + Math.abs(node.height * directionY)) / 2
  const centerX = node.width / 2
  const centerY = node.height / 2
  return {
    startX: centerX - directionX * halfLength,
    startY: centerY - directionY * halfLength,
    endX: centerX + directionX * halfLength,
    endY: centerY + directionY * halfLength
  }
}

/**
 * Whether a node paints its gradient: it has one, and nothing but a shape or frame has a fill.
 * @param node - The node to check.
 * @returns The gradient to paint, or undefined for the solid fill.
 */
export const getFillGradient = (node: DesignNode): Gradient | undefined =>
  node.type === 'text' || node.type === 'group' || node.type === 'page'
    ? undefined
    : (node.gradient ?? undefined)

/**
 * Whether a node takes blur, shadow and blend mode. Only the two plain shapes do: a frame or a
 * group would need its contents drawn to a layer first, and text keeps its own drawing path.
 * @param node - The node to check.
 * @returns True for a rectangle or an ellipse.
 */
export const hasLayerEffects = (node: DesignNode): boolean =>
  node.type === 'rectangle' || node.type === 'ellipse'
