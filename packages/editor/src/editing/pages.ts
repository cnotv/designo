import { getPageNodes, type DesignDocument, type DesignOperation } from '@designo/core'

/**
 * Keeps the page being edited, or falls back to the first when it is gone or none was chosen.
 * @param document - The document.
 * @param chosenId - The page the editor last showed.
 * @returns The id of the page to show.
 */
export const resolveActivePageId = (
  document: DesignDocument,
  chosenId: string | undefined
): string =>
  getPageNodes(document).find((page) => page.id === chosenId)?.id ??
  getPageNodes(document)[0]?.id ??
  document.rootId

/**
 * The document as the editor sees it: the shown page is its root, so layers, selection, export
 * and the canvas read one page without each knowing about the others. Edits still apply to the
 * whole document.
 * @param document - The whole document.
 * @param pageId - The page to show.
 * @returns A view with that page as the root.
 */
export const showPage = (document: DesignDocument, pageId: string): DesignDocument => ({
  ...document,
  rootId: pageId
})

/**
 * Adds a page after the others.
 * @param pageId - The new page's id.
 * @returns The operations.
 */
export const createAddPageOperations = (pageId: string): DesignOperation[] => [
  { kind: 'createPage', id: pageId }
]

/**
 * Renames a page.
 * @param document - The document.
 * @param pageId - The page.
 * @param name - The typed name.
 * @returns The operations; none when the name is empty or unchanged.
 */
export const createRenamePageOperations = (
  document: DesignDocument,
  pageId: string,
  name: string
): DesignOperation[] => {
  const trimmed = name.trim()
  return trimmed === '' || trimmed === document.nodes[pageId]?.name
    ? []
    : [{ kind: 'update', id: pageId, patch: { name: trimmed } }]
}

/**
 * Moves a page one place earlier or later by swapping its order with its neighbour's.
 * @param document - The document.
 * @param pageId - The page to move.
 * @param direction - -1 for earlier, 1 for later.
 * @returns The operations; none at the end of the row.
 */
export const createMovePageOperations = (
  document: DesignDocument,
  pageId: string,
  direction: -1 | 1
): DesignOperation[] => {
  const pages = getPageNodes(document)
  const index = pages.findIndex((page) => page.id === pageId)
  const page = pages[index]
  const neighbour = pages[index + direction]
  return page && neighbour
    ? [
        { kind: 'reorderPage', id: page.id, order: neighbour.order },
        { kind: 'reorderPage', id: neighbour.id, order: page.order }
      ]
    : []
}

/**
 * Deletes a page with everything on it.
 * @param document - The document.
 * @param pageId - The page.
 * @returns The operations; none for the only page, which a file always keeps.
 */
export const createDeletePageOperations = (
  document: DesignDocument,
  pageId: string
): DesignOperation[] => (getPageNodes(document).length > 1 ? [{ kind: 'delete', id: pageId }] : [])

/**
 * Picks the page to show once one is deleted: the one before it, else the one after.
 * @param document - The document before the delete.
 * @param pageId - The page being deleted.
 * @returns The id to show.
 */
export const getPageToShowAfterDelete = (document: DesignDocument, pageId: string): string => {
  const pages = getPageNodes(document)
  const index = pages.findIndex((page) => page.id === pageId)
  return (pages[index - 1] ?? pages[index + 1])?.id ?? document.rootId
}
