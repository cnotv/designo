import type { DesignDocument, DesignOperation } from '@designo/core'
import { toTextLayoutRequest, type TextLayoutRequest } from '@designo/text'
import type { TextBoxSize } from './types.ts'

/**
 * Finds the auto width texts whose box is not the size they are drawn at. A text made by an
 * operation batch, or saved while its fonts were missing, keeps an estimated box until something
 * measures it; this is that measurement.
 * @param document - The document.
 * @param measureShaped - The shaped size of a text, or undefined while its fonts are not loaded;
 *   such a text is left alone so a later call can fit it, rather than writing an estimate.
 * @returns One update per text that does not fit, none when all do.
 */
export const findStaleTextBoxes = (
  document: DesignDocument,
  measureShaped: (request: TextLayoutRequest) => TextBoxSize | undefined
): DesignOperation[] =>
  Object.values(document.nodes).flatMap((node): DesignOperation[] => {
    if (node.type !== 'text' || node.textWrap || node.text === '') return []
    const size = measureShaped(toTextLayoutRequest(node))
    if (!size) return []
    const width = Math.ceil(size.width)
    const height = Math.ceil(size.height)
    return width === node.width && height === node.height
      ? []
      : [{ kind: 'update', id: node.id, patch: { width, height } }]
  })
