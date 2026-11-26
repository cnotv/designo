import type { Box, PlacedNode } from './scope.ts'
import type { AtsFinding } from './types.ts'

// Parsers drop or misplace what sits in the outer strips of a page, where headers and footers go.
const MARGIN_STRIP_RATIO = 0.06
const SYMBOL_ONLY_PATTERN = /^[^\p{L}\p{N}]{1,2}$/u

const overlaps = (first: Box, second: Box): boolean =>
  first.x < second.x + second.width &&
  second.x < first.x + first.width &&
  first.y < second.y + second.height &&
  second.y < first.y + first.height

const warn = (rule: string, message: string, placed: PlacedNode): AtsFinding => ({
  rule,
  status: 'warn',
  message,
  nodeId: placed.node.id,
  page: placed.page
})

const isInMarginStrip = ({ box, pageBox }: PlacedNode): boolean =>
  pageBox.height > 0 &&
  (box.y + box.height <= pageBox.height * MARGIN_STRIP_RATIO ||
    box.y >= pageBox.height * (1 - MARGIN_STRIP_RATIO))

/**
 * Looks in the document for what a reader loses without saying so: text in the header or footer
 * strip of a page, text drawn over a picture, and a symbol or icon standing where a word should.
 * @param placedNodes - What the export draws.
 * @returns A warning for each such text, or one pass.
 */
export const checkLayoutTraps = (placedNodes: readonly PlacedNode[]): AtsFinding[] => {
  const texts = placedNodes.filter(
    (placed) => placed.node.type === 'text' && placed.node.text.trim() !== ''
  )
  const images = placedNodes.filter((placed) => placed.node.type === 'image')
  const warnings = texts.flatMap((placed) => [
    ...(isInMarginStrip(placed)
      ? [
          warn(
            'layout-traps',
            'Sits in the header or footer strip, which many parsers skip.',
            placed
          )
        ]
      : []),
    ...(images.some((image) => image.page === placed.page && overlaps(image.box, placed.box))
      ? [
          warn(
            'layout-traps',
            'Sits over a picture, which a reader may take for part of the image.',
            placed
          )
        ]
      : []),
    ...(SYMBOL_ONLY_PATTERN.test(placed.node.text.trim())
      ? [
          warn(
            'layout-traps',
            'A symbol or icon where a word is expected, and it reads as nothing or as a stray character.',
            placed
          )
        ]
      : [])
  ])
  return warnings.length > 0
    ? warnings
    : [
        {
          rule: 'layout-traps',
          status: 'pass',
          message: 'No text in the header or footer strip, over a picture or as an icon.'
        }
      ]
}
