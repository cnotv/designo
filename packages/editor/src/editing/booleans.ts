import {
  getBooleanResult,
  getPaintOrder,
  type BooleanOperation,
  type DesignDocument,
  type DesignNode
} from '@designo/core'
import { getTopmostIds } from './selection.ts'
import type { SelectionChange } from './types.ts'

const NO_CHANGE: SelectionChange = { operations: [], selection: [] }

const OPERATION_NAMES: Record<BooleanOperation, string> = {
  union: 'Union',
  subtract: 'Subtract',
  intersect: 'Intersect',
  exclude: 'Exclude'
}

const hasOutline = (node: DesignNode): boolean =>
  node.type === 'rectangle' || node.type === 'ellipse' || node.type === 'path'

// Back to front, because the back shape is the one a subtraction cuts from.
const selectedShapes = (document: DesignDocument, nodeIds: readonly string[]): DesignNode[] => {
  const topmost = new Set(getTopmostIds(document, nodeIds))
  return getPaintOrder(document).filter((node) => topmost.has(node.id))
}

/**
 * Builds the replacement of selected shapes by one path that is their union, what is left of the
 * back shape after the others are cut from it, their overlap, or everything but their overlap.
 * The path takes the back shape's paint and its place in the layers.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @param operation - How the shapes combine.
 * @param resultId - The id for the new path.
 * @returns The operations and the path as the new selection; nothing unless two or more
 * rectangles, ellipses or paths share a parent.
 */
export const createBooleanSelectionOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  operation: BooleanOperation,
  resultId: string
): SelectionChange => {
  const shapes = selectedShapes(document, nodeIds)
  const [back] = shapes
  if (!back?.parentId || shapes.length < 2) return NO_CHANGE
  if (!shapes.every(hasOutline) || shapes.some((shape) => shape.parentId !== back.parentId)) {
    return NO_CHANGE
  }
  const box = getBooleanResult(operation, shapes)
  return {
    operations: [
      {
        kind: 'create',
        id: resultId,
        type: 'path',
        parentId: back.parentId,
        order: back.order,
        properties: {
          ...box,
          name: OPERATION_NAMES[operation],
          rotation: 0,
          fill: back.fill,
          stroke: back.stroke,
          strokeWidth: back.strokeWidth,
          opacity: back.opacity
        }
      },
      ...shapes.map((shape) => ({ kind: 'delete' as const, id: shape.id }))
    ],
    selection: [resultId]
  }
}
