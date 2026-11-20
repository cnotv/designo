import type { DesignDocument, DesignNode } from '@designo/core'
import { toTextLayoutRequest } from '@designo/text'
import type { OperationInput } from '@designo/storage'
import type { LayoutText } from './types.ts'

// What changes how big a text is. The line height changes only how tall it stands.
const BOX_PROPERTIES = [
  'text',
  'fontFamily',
  'fontSize',
  'lineHeight',
  'textWrap',
  'width'
] as const

const changesBox = (patch: object): boolean => BOX_PROPERTIES.some((key) => key in patch)

const isTextOperation = (operation: OperationInput, document: DesignDocument): boolean =>
  operation.kind === 'create'
    ? operation.type === 'text'
    : operation.kind === 'update' && document.nodes[operation.id]?.type === 'text'

/**
 * Makes a width given to a text a fixed width, as the editor does. Without it the width would
 * be overwritten by the text's own the moment the text is fitted, and an agent that sets a width
 * means the text to wrap there.
 * @param operations - The batch as the agent wrote it.
 * @param document - The document before the batch.
 * @returns The batch, with `textWrap: true` added to each text operation that sets a width alone.
 */
export const inferFixedWidth = (
  operations: readonly OperationInput[],
  document: DesignDocument
): OperationInput[] =>
  operations.map((operation) => {
    if (!isTextOperation(operation, document)) return operation
    if (operation.kind === 'create') {
      const properties = operation.properties ?? {}
      return 'width' in properties && !('textWrap' in properties)
        ? { ...operation, properties: { ...properties, textWrap: true } }
        : operation
    }
    return operation.kind === 'update' &&
      'width' in operation.patch &&
      !('textWrap' in operation.patch)
      ? { ...operation, patch: { ...operation.patch, textWrap: true } }
      : operation
  })

const touchedTextIds = (
  document: DesignDocument,
  operations: readonly OperationInput[],
  createdNodeIds: readonly string[]
): string[] =>
  [
    ...new Set([
      ...createdNodeIds,
      ...operations.flatMap((operation) =>
        operation.kind === 'update' && changesBox(operation.patch) ? [operation.id] : []
      )
    ])
  ].filter((id) => document.nodes[id]?.type === 'text')

type TextBoxFit = { updates: OperationInput[]; unfitted: DesignNode[] }

const fitNode = async (node: DesignNode, layoutText: LayoutText): Promise<TextBoxFit> => {
  if (node.text === '') return { updates: [], unfitted: [] }
  const layout = await layoutText(toTextLayoutRequest(node))
  if (!layout) return { updates: [], unfitted: [node] }
  const height = Math.ceil(layout.height)
  const patch = node.textWrap ? { height } : { width: Math.ceil(layout.width), height }
  const fits =
    patch.height === node.height && ('width' in patch ? patch.width === node.width : true)
  return { updates: fits ? [] : [{ kind: 'update', id: node.id, patch }], unfitted: [] }
}

/**
 * Sizes the texts a batch created or changed to what they draw: an auto-width text follows its
 * words in both directions, a fixed-width one keeps its width and is as tall as its lines wrap
 * to. A text whose fonts are not available keeps the box it was given, and is reported so the
 * caller knows it may clip.
 * @param document - The document after the batch.
 * @param operations - The batch that was applied.
 * @param createdNodeIds - The ids the batch created.
 * @param layoutText - Lays a text out.
 * @returns The updates that fit each text, none for a text that already fits, and a warning for
 *   each text that could not be fitted.
 */
export const findTextBoxFits = async (
  document: DesignDocument,
  operations: readonly OperationInput[],
  createdNodeIds: readonly string[],
  layoutText: LayoutText
): Promise<{ updates: OperationInput[]; warnings: string[] }> => {
  const nodes = touchedTextIds(document, operations, createdNodeIds).flatMap((id) =>
    document.nodes[id] ? [document.nodes[id]] : []
  )
  const fits = await Promise.all(nodes.map((node) => fitNode(node, layoutText)))
  return {
    updates: fits.flatMap((fit) => fit.updates),
    warnings: fits.flatMap((fit) =>
      fit.unfitted.map(
        (node) =>
          `Text ${node.id} was not fitted: the fonts for its family, or for a character in it, are not available, so it keeps its ${node.width} x ${node.height} box and may clip.`
      )
    )
  }
}
