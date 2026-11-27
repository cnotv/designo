import { paperScope } from './paperScope.ts'
import type { PathAnchor, PathContour, PathPoint } from './types.ts'

const toHandle = (point: paper.Point): PathPoint | null =>
  point.isZero() ? null : { x: point.x, y: point.y }

const toAnchor = (segment: paper.Segment): PathAnchor => ({
  x: segment.point.x,
  y: segment.point.y,
  handleIn: toHandle(segment.handleIn),
  handleOut: toHandle(segment.handleOut)
})

const toContour = (path: paper.Path): PathContour => ({
  anchors: path.segments.map(toAnchor),
  closed: path.closed
})

const listPaths = (item: paper.Item): paper.Path[] =>
  item instanceof paperScope.Path ? [item] : (item.children ?? []).flatMap(listPaths)

/**
 * Reads an outline as its anchors: each point with the two bezier handles that shape the curves
 * on either side of it. A handle is relative to its anchor, and null where the point is a corner.
 * @param pathData - SVG path data.
 * @returns One contour for each subpath, such as the outline and each hole.
 */
export const getPathContours = (pathData: string): PathContour[] => {
  if (pathData.trim() === '') return []
  const item = paperScope.PathItem.create(pathData)
  const contours = listPaths(item).map(toContour)
  item.remove()
  return contours
}

const buildPath = (contour: PathContour): paper.Path => {
  const path = new paperScope.Path({ insert: false, closed: contour.closed })
  contour.anchors.forEach((anchor) =>
    path.add(
      new paperScope.Segment(
        new paperScope.Point(anchor.x, anchor.y),
        new paperScope.Point(anchor.handleIn?.x ?? 0, anchor.handleIn?.y ?? 0),
        new paperScope.Point(anchor.handleOut?.x ?? 0, anchor.handleOut?.y ?? 0)
      )
    )
  )
  return path
}

/**
 * Writes anchors back as SVG path data.
 * @param contours - The contours, from `getPathContours` or edited from it.
 * @returns The path data.
 */
export const writePathContours = (contours: readonly PathContour[]): string => {
  const paths = contours.map(buildPath)
  const compound = new paperScope.CompoundPath({ children: paths, insert: false })
  const { pathData } = compound
  compound.remove()
  return pathData
}

/**
 * Adds an anchor on the outline where it is nearest a point, keeping the curve's shape.
 * @param pathData - SVG path data.
 * @param point - Where the person clicked, in the outline's space.
 * @param tolerance - How far from the outline the point may be and still count.
 * @returns The new path data and where the new anchor sits, or undefined when the outline is
 * farther than the tolerance.
 */
export const insertPathAnchor = (
  pathData: string,
  point: PathPoint,
  tolerance: number
): { pathData: string; contour: number; index: number } | undefined => {
  const item = paperScope.PathItem.create(pathData)
  const paths = listPaths(item)
  const hit = paths
    .map((path, contour) => ({
      contour,
      location: path.getNearestLocation(new paperScope.Point(point.x, point.y))
    }))
    .filter(({ location }) => location && location.distance <= tolerance)
    .toSorted((first, second) => (first.location?.distance ?? 0) - (second.location?.distance ?? 0))
    .at(0)
  const path = hit ? paths[hit.contour] : undefined
  const inserted = hit?.location && path ? path.divideAt(hit.location) : undefined
  const result = inserted && hit ? { contour: hit.contour, index: inserted.index } : undefined
  const written = writePathContours(paths.map(toContour))
  item.remove()
  return result ? { pathData: written, ...result } : undefined
}

/**
 * Gives an anchor handles that make the curve pass smoothly through it.
 * @param contours - The contours.
 * @param contourIndex - Which contour holds the anchor.
 * @param anchorIndex - The anchor.
 * @returns The contours with that anchor smoothed.
 */
export const smoothPathAnchor = (
  contours: readonly PathContour[],
  contourIndex: number,
  anchorIndex: number
): PathContour[] =>
  contours.map((contour, index) => {
    if (index !== contourIndex) return contour
    const path = buildPath(contour)
    path.segments[anchorIndex]?.smooth()
    return toContour(path)
  })
