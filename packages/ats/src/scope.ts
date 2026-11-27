import { getChildren, getPageNodes, type DesignDocument, type DesignNode } from '@designo/core'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A node placed on a PDF page, its box measured from the page's own origin; `pageBox` is empty for a design page. */
export interface PlacedNode {
  node: DesignNode
  page: number
  box: Box
  pageBox: Box
}

const isRendered = (node: DesignNode): boolean => node.visible && node.opacity > 0

// Coordinates are absolute on the page, never relative to the parent.
// ponytail: rotation is ignored, so a rotated node's box is its unrotated one.
const collect = (document: DesignDocument, parent: DesignNode): DesignNode[] =>
  getChildren(document, parent.id)
    .filter(isRendered)
    .flatMap((child) => [child, ...collect(document, child)])

/**
 * Lists what a PDF export draws, by page: the frames marked with a `pdfPage` in that order, or each
 * design page when no frame is marked. Hidden nodes and their children are left out.
 * @param document - The document, with its master pages resolved.
 * @returns The nodes of every page, in drawing order.
 */
export const getPlacedNodes = (document: DesignDocument): PlacedNode[] => {
  const frames = Object.values(document.nodes)
    .filter((node) => node.type === 'frame' && node.pdfPage !== null && isRendered(node))
    .toSorted((first, second) => (first.pdfPage ?? 0) - (second.pdfPage ?? 0))
  const roots = frames.length > 0 ? frames : getPageNodes(document)
  return roots.flatMap((root, index) => {
    // A frame is its own page, and boxes are measured from its corner. A design page has no fixed
    // size, so it has no margins to read.
    const origin = root.type === 'frame' ? root : { x: 0, y: 0 }
    const pageBox =
      root.type === 'frame'
        ? { x: 0, y: 0, width: root.width, height: root.height }
        : { x: 0, y: 0, width: 0, height: 0 }
    return collect(document, root).map((node) => ({
      node,
      page: index + 1,
      box: { x: node.x - origin.x, y: node.y - origin.y, width: node.width, height: node.height },
      pageBox
    }))
  })
}
