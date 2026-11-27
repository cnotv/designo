import { getBooleanResult } from './pathOutline.ts'
import { getPaintOrder } from './document.ts'
import type { BooleanOperation, DesignDocument, DesignNode, DesignOperation } from './types.ts'

const OPERATION_NAMES: Record<BooleanOperation, string> = {
  union: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  exclude: 'Exclude'
}

const hasOutline = (node: DesignNode): boolean =>
  node.type === 'rectangle' || node.type === 'ellipse' || node.type === 'path'

// Back to front, because the back shape is the one a subtraction cuts from.
const getShapesBackToFront = (
  document: DesignDocument,
  nodeIds: readonly string[]
): DesignNode[] => {
  const wanted = new Set(nodeIds)
  return getPaintOrder(document).filter((node) => wanted.has(node.id))
}

/**
 * Builds the replacement of shapes by one path that is their union, what is left of the back
 * shape after the others are cut from it, their overlap, or everything but their overlap. The
 * path takes the back shape's paint and its place in the layers.
 * @param document - The document.
 * @param nodeIds - The shapes to combine.
 * @param operation - How the shapes combine.
 * @param resultId - The id for the new path.
 * @returns A create for the path and a delete for each shape; nothing unless two or more
 * rectangles, ellipses or paths share a parent.
 */
export const getBooleanOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  operation: BooleanOperation,
  resultId: string
): DesignOperation[] => {
  const shapes = getShapesBackToFront(document, nodeIds)
  const [back] = shapes
  if (!back?.parentId || shapes.length < 2 || shapes.length !== new Set(nodeIds).size) return []
  if (!shapes.every(hasOutline) || shapes.some((shape) => shape.parentId !== back.parentId)) {
    return []
  }
  return [
    {
      kind: 'create',
      id: resultId,
      type: 'path',
      parentId: back.parentId,
      order: back.order,
      properties: {
        ...getBooleanResult(operation, shapes),
        name: OPERATION_NAMES[operation],
        rotation: 0,
        fill: back.fill,
        stroke: back.stroke,
        strokeWidth: back.strokeWidth,
        opacity: back.opacity
      }
    },
    ...shapes.map((shape) => ({ kind: 'delete' as const, id: shape.id }))
  ]
}
