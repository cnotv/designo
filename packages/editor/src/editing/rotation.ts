import { getHandlePositions, resizeBounds } from './geometry.ts'
import type { Bounds, Point, ResizeHandle } from './types.ts'

const ROTATION_PRECISION = 100
const HALF_TURN = 180
const FULL_TURN = 360

export const ROTATION_SNAP_DEGREES = 15

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / HALF_TURN

/**
 * Turns an angle into the equivalent one in [-180, 180), rounded to two decimals so repeated
 * drags do not accumulate floating point noise in the document.
 * @param degrees - Any angle.
 * @returns The normalised angle.
 */
export const normalizeRotation = (degrees: number): number => {
  const wrapped = ((((degrees + HALF_TURN) % FULL_TURN) + FULL_TURN) % FULL_TURN) - HALF_TURN
  return Math.round(wrapped * ROTATION_PRECISION) / ROTATION_PRECISION
}

/**
 * Rotates a point around a centre. Positive degrees turn clockwise on screen, as the canvas does.
 * @param point - The point.
 * @param center - The pivot.
 * @param degrees - The angle.
 * @returns The rotated point.
 */
export const rotatePoint = (point: Point, center: Point, degrees: number): Point => {
  const radians = degreesToRadians(degrees)
  const offsetX = point.x - center.x
  const offsetY = point.y - center.y
  return {
    x: center.x + offsetX * Math.cos(radians) - offsetY * Math.sin(radians),
    y: center.y + offsetX * Math.sin(radians) + offsetY * Math.cos(radians)
  }
}

/**
 * Finds the middle of a box, which is what a node rotates around.
 * @param bounds - The box.
 * @returns Its centre.
 */
export const getBoundsCenter = (bounds: Bounds): Point => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2
})

/**
 * Lists the corners of a rotated box, clockwise from the top left.
 * @param bounds - The box before rotation.
 * @param rotation - Rotation in degrees around the centre.
 * @returns The four corners in world units.
 */
export const getRotatedCorners = (bounds: Bounds, rotation: number): Point[] => {
  const center = getBoundsCenter(bounds)
  const { x, y, width, height } = bounds
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ].map((corner) => rotatePoint(corner, center, rotation))
}

/**
 * Lists where the eight resize handles sit around a rotated box.
 * @param bounds - The box before rotation.
 * @param rotation - Rotation in degrees around the centre.
 * @returns Each handle with its centre point in world units.
 */
export const getRotatedHandlePositions = (
  bounds: Bounds,
  rotation: number
): { handle: ResizeHandle; point: Point }[] =>
  getHandlePositions(bounds).map(({ handle, point }) => ({
    handle,
    point: rotatePoint(point, getBoundsCenter(bounds), rotation)
  }))

/**
 * Tells whether a world point lies inside a rotated box, by undoing the rotation first.
 * @param bounds - The box before rotation.
 * @param rotation - Rotation in degrees around the centre.
 * @param point - The point in world units.
 * @returns True when the point is inside, edges included.
 */
export const rotatedBoundsContainPoint = (
  bounds: Bounds,
  rotation: number,
  point: Point
): boolean => {
  const local = rotatePoint(point, getBoundsCenter(bounds), -rotation)
  return (
    local.x >= bounds.x &&
    local.x <= bounds.x + bounds.width &&
    local.y >= bounds.y &&
    local.y <= bounds.y + bounds.height
  )
}

const angleOf = (center: Point, point: Point): number =>
  (Math.atan2(point.y - center.y, point.x - center.x) * HALF_TURN) / Math.PI

/**
 * Works out a node's rotation while its rotate gesture is dragged: the angle the pointer has
 * swept around the centre is added to the rotation the node started with.
 * @param request - The centre, the pointer at the start and now, the starting rotation, and
 * whether to snap the result to 15 degree steps.
 * @returns The new rotation in degrees.
 */
export const computeRotation = ({
  center,
  startPoint,
  currentPoint,
  startRotation,
  snap
}: {
  center: Point
  startPoint: Point
  currentPoint: Point
  startRotation: number
  snap: boolean
}): number => {
  const swept = angleOf(center, currentPoint) - angleOf(center, startPoint)
  const rotation = startRotation + swept
  return normalizeRotation(
    snap ? Math.round(rotation / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES : rotation
  )
}

/**
 * Resizes a rotated box by dragging a handle in the box's own axes. The edge opposite the handle
 * stays where it is on screen.
 * @param start - The box when the drag began, before rotation.
 * @param rotation - Rotation in degrees around the centre.
 * @param handle - The handle being dragged.
 * @param delta - How far the pointer moved in world units.
 * @returns The new box, to be rotated by the same angle around its new centre.
 */
export const resizeRotatedBounds = (
  start: Bounds,
  rotation: number,
  handle: ResizeHandle,
  delta: Point
): Bounds => {
  const localDelta = rotatePoint(delta, { x: 0, y: 0 }, -rotation)
  const localBox = resizeBounds(start, handle, localDelta.x, localDelta.y)
  const center = rotatePoint(getBoundsCenter(localBox), getBoundsCenter(start), rotation)
  return {
    x: center.x - localBox.width / 2,
    y: center.y - localBox.height / 2,
    width: localBox.width,
    height: localBox.height
  }
}
