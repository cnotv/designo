import type { PlacedNode } from './scope.ts'
import type { AtsFinding, PdfFacts } from './types.ts'

const collapse = (text: string): string => text.replaceAll(/\s+/g, ' ').trim()
const strip = (text: string): string => text.replaceAll(/\s+/g, '')

const toParagraphs = (text: string): string[] =>
  text
    .split('\n')
    .map(collapse)
    .filter((paragraph) => paragraph !== '')

// A text with a blur or a shadow is an image in the PDF, so no reader can select it.
const isDrawnAsImage = (node: PlacedNode['node']): boolean => node.blur > 0 || node.shadow !== null

const toFinding = (
  rule: string,
  status: AtsFinding['status'],
  message: string,
  placed?: PlacedNode
): AtsFinding => ({
  rule,
  status,
  message,
  ...(placed ? { nodeId: placed.node.id, page: placed.page } : {})
})

/**
 * Checks that every text of the document is text in the PDF, and that a reader gets it back as it
 * was written. The first rule fails on a text with no trace in the file; the second warns when the
 * letters are all there but spaces or their order are not.
 * @param placedNodes - What the export draws.
 * @param facts - What a reader finds in the PDF.
 * @returns One finding for each text that fails, or one pass for each rule.
 */
export const checkTextExtraction = (
  placedNodes: readonly PlacedNode[],
  facts: PdfFacts
): AtsFinding[] => {
  const extracted = facts.pages.flatMap((page) => page.items.map((item) => item.text)).join(' ')
  const extractedCollapsed = collapse(extracted)
  const extractedStripped = strip(extracted)
  const texts = placedNodes.filter(
    (placed) => placed.node.type === 'text' && toParagraphs(placed.node.text).length > 0
  )
  const selectable = texts.flatMap((placed) => {
    if (isDrawnAsImage(placed.node))
      return [
        toFinding(
          'selectable-text',
          'fail',
          'Drawn as an image: it has a blur or a shadow, so it cannot be selected.',
          placed
        )
      ]
    return toParagraphs(placed.node.text).some(
      (paragraph) => !extractedStripped.includes(strip(paragraph))
    )
      ? [toFinding('selectable-text', 'fail', 'Its text is not found in the PDF text.', placed)]
      : []
  })
  const failedIds = new Set(selectable.map((finding) => finding.nodeId))
  const garbled = texts
    .filter((placed) => !failedIds.has(placed.node.id))
    .filter((placed) =>
      toParagraphs(placed.node.text).some((paragraph) => !extractedCollapsed.includes(paragraph))
    )
    .map((placed) =>
      toFinding(
        'text-extraction',
        'warn',
        'A reader gets its words glued, split or reordered.',
        placed
      )
    )
  return [
    ...(selectable.length > 0
      ? selectable
      : [toFinding('selectable-text', 'pass', `${texts.length} texts are selectable text.`)]),
    ...(garbled.length > 0
      ? garbled
      : [toFinding('text-extraction', 'pass', 'Extracted text matches the document.')])
  ]
}
