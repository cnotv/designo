import { paperScope } from './paperScope.ts'
import { combinePaths } from './booleans.ts'
import type { BooleanOperation, DesignNode } from './types.ts'

/** The box and outline of a node made by combining others; the outline starts at the box's corner. */
export interface BooleanResult {
  x: number
  y: number
  width: number
  height: number
  pathData: string
}

const makeLocalItem = (node: DesignNode): paper.PathItem => {
  if (node.type === 'ellipse') {
    return new paperScope.Path.Ellipse({ point: [0, 0], size: [node.width, node.height] })
  }
  if (node.type === 'path') return paperScope.PathItem.create(node.pathData)
  return new paperScope.Path.Rectangle({
    point: [0, 0],
    size: [node.width, node.height],
    radius: Math.min(node.cornerRadius, node.width / 2, node.height / 2)
  })
}

/**
 * Traces a rectangle, an ellipse or a path node as an outline in the page's coordinates, with the
 * node's position and its turn about the centre of its box applied.
 * @param node - A node with an outline.
 * @returns SVG path data.
 */
export const getWorldOutline = (node: DesignNode): string => {
  if (node.type !== 'rectangle' && node.type !== 'ellipse' && node.type !== 'path') {
    throw new Error(`A ${node.type} node has no outline`)
  }
  const item = makeLocalItem(node)
  item.translate(new paperScope.Point(node.x, node.y))
  if (node.rotation !== 0) {
    item.rotate(
      node.rotation,
      new paperScope.Point(node.x + node.width / 2, node.y + node.height / 2)
    )
  }
  const { pathData } = item
  item.remove()
  return pathData
}

/**
 * Combines nodes into the box and outline of one path node. The first node is the base, so a
 * subtraction cuts the later ones from it.
 * @param operation - How the outlines merge.
 * @param nodes - At least two rectangles, ellipses or path nodes, back to front.
 * @returns The new node's position and size, and its outline relative to that position.
 */
export const getBooleanResult = (
  operation: BooleanOperation,
  nodes: readonly DesignNode[]
): BooleanResult => {
  if (nodes.length < 2) throw new Error('A boolean operation needs at least two nodes')
  const combined = paperScope.PathItem.create(combinePaths(operation, nodes.map(getWorldOutline)))
  const { x, y, width, height } = combined.bounds
  combined.translate(new paperScope.Point(-x, -y))
  const { pathData } = combined
  combined.remove()
  return { x, y, width, height, pathData }
}
