import { getChildren, getPageNodes } from './document.ts'
import type { DesignDocument, DesignNode, LayoutSizing } from './types.ts'

type NodeMap = Readonly<Record<string, DesignNode>>

interface AxisNames {
  size: 'width' | 'height'
  position: 'x' | 'y'
  sizing: 'widthSizing' | 'heightSizing'
}

const WIDTH_AXIS: AxisNames = { size: 'width', position: 'x', sizing: 'widthSizing' }
const HEIGHT_AXIS: AxisNames = { size: 'height', position: 'y', sizing: 'heightSizing' }

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

// Keeps the same object when nothing changes, so an untouched document stays the same document.
const withValues = (node: DesignNode, values: Partial<DesignNode>): DesignNode =>
  Object.entries(values).every(([key, value]) => node[key as keyof DesignNode] === value)
    ? node
    : { ...node, ...values }

const axesOf = (frame: DesignNode): { main: AxisNames; cross: AxisNames } =>
  frame.layoutMode === 'horizontal'
    ? { main: WIDTH_AXIS, cross: HEIGHT_AXIS }
    : { main: HEIGHT_AXIS, cross: WIDTH_AXIS }

const childIdsOf = (document: DesignDocument, frameId: string): string[] =>
  getChildren(document, frameId).map((child) => child.id)

// A child that fills an axis takes no part in what a hugging parent measures there.
const hugExtent = (child: DesignNode, axis: AxisNames): number =>
  child[axis.sizing] === 'fill' ? 0 : child[axis.size]

const measure = (document: DesignDocument, nodes: NodeMap, frameId: string): NodeMap => {
  const childIds = childIdsOf(document, frameId)
  const measured = childIds.reduce((current, id) => measure(document, current, id), nodes)
  const frame = measured[frameId]
  if (!frame || frame.layoutMode === 'none') return measured
  const { main, cross } = axesOf(frame)
  const children = childIds.flatMap((id) => {
    const child = measured[id]
    return child?.visible ? [child] : []
  })
  const mainContent =
    sum(children.map((child) => hugExtent(child, main))) +
    frame.layoutGap * Math.max(children.length - 1, 0)
  const crossContent = Math.max(0, ...children.map((child) => hugExtent(child, cross)))
  const hugged = (axis: AxisNames, content: number): Partial<DesignNode> =>
    frame[axis.sizing] === 'hug' ? { [axis.size]: content + 2 * frame.layoutPadding } : {}
  return {
    ...measured,
    [frameId]: withValues(frame, { ...hugged(main, mainContent), ...hugged(cross, crossContent) })
  }
}

const crossOffset = (align: DesignNode['layoutCrossAlign'], free: number): number =>
  align === 'center' ? free / 2 : align === 'end' ? free : 0

const mainStart = (
  align: DesignNode['layoutAlign'],
  free: number,
  count: number,
  gap: number
): { start: number; step: number } => {
  if (align === 'space-between' && count > 1) return { start: 0, step: gap + free / (count - 1) }
  const start = align === 'center' ? free / 2 : align === 'end' ? free : 0
  return { start, step: gap }
}

const placeChildren = (
  document: DesignDocument,
  nodes: NodeMap,
  frame: DesignNode,
  childIds: readonly string[]
): NodeMap => {
  const { main, cross } = axesOf(frame)
  const children = childIds.flatMap((id) => {
    const child = nodes[id]
    return child?.visible ? [child] : []
  })
  const innerMain = Math.max(0, frame[main.size] - 2 * frame.layoutPadding)
  const innerCross = Math.max(0, frame[cross.size] - 2 * frame.layoutPadding)
  const fillCount = children.filter((child) => child[main.sizing] === 'fill').length
  const gaps = frame.layoutGap * Math.max(children.length - 1, 0)
  const fixedMain = sum(children.map((child) => hugExtent(child, main)))
  const fillSize = fillCount > 0 ? Math.max(0, (innerMain - fixedMain - gaps) / fillCount) : 0
  const mainSizeOf = (child: DesignNode): number =>
    child[main.sizing] === 'fill' ? fillSize : child[main.size]
  const free = fillCount > 0 ? 0 : innerMain - fixedMain - gaps
  const { start, step } = mainStart(
    frame.layoutAlign,
    Math.max(0, free),
    children.length,
    frame.layoutGap
  )
  const origin = (axis: AxisNames): number => frame[axis.position] + frame.layoutPadding
  return children.reduce(
    (state, child) => {
      const mainSize = mainSizeOf(child)
      const crossSize = child[cross.sizing] === 'fill' ? innerCross : child[cross.size]
      const placed = withValues(child, {
        [main.position]: origin(main) + start + state.cursor,
        [cross.position]:
          origin(cross) + crossOffset(frame.layoutCrossAlign, innerCross - crossSize),
        [main.size]: mainSize,
        [cross.size]: crossSize
      })
      return {
        cursor: state.cursor + mainSize + step,
        nodes: { ...state.nodes, [child.id]: placed }
      }
    },
    { cursor: 0, nodes }
  ).nodes
}

const place = (document: DesignDocument, nodes: NodeMap, nodeId: string): NodeMap => {
  const node = nodes[nodeId]
  if (!node) return nodes
  const childIds = childIdsOf(document, nodeId)
  const placed = node.layoutMode === 'none' ? nodes : placeChildren(document, nodes, node, childIds)
  return childIds.reduce((current, id) => place(document, current, id), placed)
}

const usesAutoLayout = (document: DesignDocument): boolean =>
  Object.values(document.nodes).some((node) => node.layoutMode !== 'none')

/**
 * Lays out every auto-layout frame: hugging frames take the size of their children from the
 * inside out, then each frame positions its children and sizes those that fill, from the outside
 * in. Positions are absolute, like every node's, and rotation is ignored.
 * @param document - The document to lay out.
 * @returns The document with positions and sizes set; the same document when nothing moves.
 */
export const layoutDocument = (document: DesignDocument): DesignDocument => {
  // ponytail: a full pass per operation, O(nodes); scope it to the changed subtrees if a drag on a huge document lags.
  if (!usesAutoLayout(document)) return document
  const nodes = getPageNodes(document).reduce(
    (current, page) => place(document, measure(document, current, page.id), page.id),
    document.nodes as NodeMap
  )
  const changed = Object.keys(nodes).some((id) => nodes[id] !== document.nodes[id])
  return changed ? { ...document, nodes } : document
}

/**
 * Tells how a node's size on one axis is decided, for a panel to show.
 * @param node - The node.
 * @param axis - Which size.
 * @returns The node's sizing on that axis.
 */
export const getSizing = (node: DesignNode, axis: 'width' | 'height'): LayoutSizing =>
  axis === 'width' ? node.widthSizing : node.heightSizing
