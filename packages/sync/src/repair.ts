import { layoutDocument, syncInstances, type DesignDocument, type DesignNode } from '@designo/core'

const collectReachable = (
  childrenByParent: ReadonlyMap<string | null, readonly DesignNode[]>,
  parentId: string | null
): string[] =>
  (childrenByParent.get(parentId) ?? []).flatMap((child) => [
    child.id,
    ...collectReachable(childrenByParent, child.id)
  ])

/**
 * Makes a merged document whole again. Two people can each make a valid change that clash once
 * merged: a node moved into a frame someone else deleted, or two frames moved into each other.
 * The nodes no page reaches are dropped, the root falls back to a page that is left, and the
 * layout runs again, since it depends on more than one node.
 * @param document - The merged document.
 * @returns The repaired document.
 */
export const repairDocument = (document: DesignDocument): DesignDocument => {
  const childrenByParent = Map.groupBy(Object.values(document.nodes), (node) => node.parentId)
  const reachable = new Set(collectReachable(childrenByParent, null))
  const nodes = Object.fromEntries(
    Object.entries(document.nodes).filter(([id]) => reachable.has(id))
  )
  const firstPage = (childrenByParent.get(null) ?? []).toSorted(
    (first, second) => first.order - second.order
  )[0]
  const rootId = nodes[document.rootId] ? document.rootId : (firstPage?.id ?? document.rootId)
  return layoutDocument(syncInstances({ ...document, rootId, nodes }))
}
