import paper from 'paper/dist/paper-core.js'
import type { BooleanOperation, PathBounds } from './types.ts'

// paper needs a project to build items in, but never draws, so a 1x1 canvas size is enough.
paper.setup(new paper.Size(1, 1))

const toItem = (pathData: string): paper.PathItem => {
  const item = paper.PathItem.create(pathData)
  item.remove()
  return item
}

const applyOperation = (
  operation: BooleanOperation,
  base: paper.PathItem,
  other: paper.PathItem
): paper.PathItem => {
  const operations: Record<BooleanOperation, () => paper.PathItem> = {
    union: () => base.unite(other, { insert: false }),
    subtract: () => base.subtract(other, { insert: false }),
    intersect: () => base.intersect(other, { insert: false }),
    exclude: () => base.exclude(other, { insert: false })
  }
  return operations[operation]()
}

/**
 * Combines SVG path outlines that share one coordinate space and returns the result as SVG path
 * data. The first path is the base; each later one is folded in from left to right, so
 * `subtract` removes every later path from the first.
 * @param operation - How the outlines merge.
 * @param pathDataList - SVG path data strings, at least one.
 * @returns The combined outline as SVG path data.
 */
export const combinePaths = (
  operation: BooleanOperation,
  pathDataList: readonly string[]
): string => {
  const [first, ...rest] = pathDataList.map(toItem)
  if (!first) throw new Error('combinePaths needs at least one path')
  return rest.reduce((result, item) => applyOperation(operation, result, item), first).pathData
}

/**
 * The enclosed area of a path outline, ignoring winding direction.
 * @param pathData - SVG path data.
 * @returns The area in square units of the path's space.
 */
export const getPathArea = (pathData: string): number => {
  const item = toItem(pathData)
  return item instanceof paper.CompoundPath
    ? item.children.reduce((total, child) => total + Math.abs((child as paper.Path).area), 0)
    : Math.abs((item as paper.Path).area)
}

/**
 * The box that holds a path outline.
 * @param pathData - SVG path data.
 * @returns The bounding box in the path's space.
 */
export const getPathBounds = (pathData: string): PathBounds => {
  const { x, y, width, height } = toItem(pathData).bounds
  return { x, y, width, height }
}
