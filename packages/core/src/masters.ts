import { getChildren, getSubtreeIds } from './document.ts'
import type { DesignDocument, DesignNode } from './types.ts'

/** Written in a text, it shows the number of the page the text is drawn on. */
export const PAGE_NUMBER_TOKEN = '{page}'

// Keeps a master's direct children behind everything the page itself holds.
const MASTER_ORDER_SHIFT = 1_000_000

const isPageUsingMaster = (document: DesignDocument, node: DesignNode): boolean => {
  const master = node.masterId ? document.nodes[node.masterId] : undefined
  return node.type === 'frame' && master?.isMaster === true && master.id !== node.id
}

// A page is numbered by its pdfPage; without one, by its place among the pages that use a master.
const getPageNumber = (node: DesignNode, usingMaster: readonly DesignNode[]): number =>
  node.pdfPage ?? usingMaster.findIndex((candidate) => candidate.id === node.id) + 1

// ponytail: a text with spans loses them when its {page} is replaced, since the offsets would shift;
// remap them when a span is needed on a page number.
const withPageNumber = (node: DesignNode, pageNumber: number): DesignNode =>
  node.type === 'text' && node.text.includes(PAGE_NUMBER_TOKEN)
    ? {
        ...node,
        text: node.text.replaceAll(PAGE_NUMBER_TOKEN, String(pageNumber)),
        spans: []
      }
    : node

const copyMasterNode = (
  node: DesignNode,
  page: DesignNode,
  master: DesignNode,
  isTop: boolean
): DesignNode => ({
  ...node,
  id: `master:${page.id}:${node.id}`,
  parentId: isTop ? page.id : `master:${page.id}:${node.parentId}`,
  order: isTop ? node.order - MASTER_ORDER_SHIFT : node.order,
  x: node.x + page.x - master.x,
  y: node.y + page.y - master.y,
  isMaster: false,
  masterId: null,
  masterHidden: [],
  pdfPage: null
})

const getMasterCopies = (
  document: DesignDocument,
  page: DesignNode,
  pageNumber: number
): DesignNode[] => {
  const master = document.nodes[page.masterId ?? ''] as DesignNode
  const hidden = new Set(page.masterHidden ?? [])
  const tops = getChildren(document, master.id).filter((child) => !hidden.has(child.id))
  return tops.flatMap((top) =>
    getSubtreeIds(document, top.id).flatMap((id) => {
      const node = document.nodes[id]
      return node
        ? [withPageNumber(copyMasterNode(node, page, master, id === top.id), pageNumber)]
        : []
    })
  )
}

const withPageNumbersInOwnNodes = (
  document: DesignDocument,
  page: DesignNode,
  pageNumber: number
): DesignNode[] =>
  getSubtreeIds(document, page.id).flatMap((id) => {
    const node = document.nodes[id]
    return node && node.id !== page.id ? [withPageNumber(node, pageNumber)] : []
  })

/**
 * Draws masters onto the pages that use them. Each page frame that names a master in `masterId`
 * gets copies of the master's children, moved to the page and placed behind the page's own nodes,
 * except the ones it lists in `masterHidden`. A `{page}` in any text of such a page becomes its
 * page number. The copies exist only in the result, so a renderer calls this once and draws what
 * it returns; the stored document is never changed.
 * @param document - The document as stored.
 * @returns The document to draw or export, or the same document when no page uses a master.
 */
export const resolveMasters = (document: DesignDocument): DesignDocument => {
  const pages = Object.values(document.nodes).filter((node) => isPageUsingMaster(document, node))
  if (pages.length === 0) return document
  const ordered = pages.toSorted((first, second) => first.order - second.order)
  const changed = ordered.flatMap((page) => {
    const pageNumber = getPageNumber(page, ordered)
    return [
      ...withPageNumbersInOwnNodes(document, page, pageNumber),
      ...getMasterCopies(document, page, pageNumber)
    ]
  })
  return {
    ...document,
    nodes: { ...document.nodes, ...Object.fromEntries(changed.map((node) => [node.id, node])) }
  }
}
