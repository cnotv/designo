import { getChildren, type DesignDocument } from '@designo/core'
import type { LayerRow } from './types.ts'

/**
 * Lists the layers as the layers panel shows them: nested under their parents, with the layer
 * drawn on top first in each level, as in Figma.
 * @param document - The document.
 * @param parentId - Where to start; the root page by default.
 * @param depth - How deep the start is.
 * @returns One row per layer, page excluded.
 */
export const getLayerRows = (
  document: DesignDocument,
  parentId: string = document.rootId,
  depth = 0
): LayerRow[] =>
  getChildren(document, parentId)
    .toReversed()
    .flatMap((node) => [{ node, depth }, ...getLayerRows(document, node.id, depth + 1)])
