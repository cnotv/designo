import type { DesignNode, TextSpan } from '@designo/core'
import type { CodeTextRun, CssDeclaration } from '../types.ts'

const spanStyle = (span: TextSpan): CssDeclaration[] => [
  ...(span.fontWeight === undefined ? [] : [['font-weight', String(span.fontWeight)] as const]),
  ...(span.fontStyle === undefined ? [] : [['font-style', span.fontStyle] as const]),
  ...(span.fill === undefined ? [] : [['color', span.fill] as const])
]

// The boundaries where a run starts or ends: the paragraph's edges and every span edge inside it.
const runBoundaries = (start: number, end: number, spans: readonly TextSpan[]): number[] =>
  [
    ...new Set([
      start,
      end,
      ...spans.flatMap((span) => [span.start, span.end]).filter((at) => at > start && at < end)
    ])
  ].toSorted((first, second) => first - second)

const spanAt = (spans: readonly TextSpan[], at: number): number =>
  spans.findIndex((span) => span.start <= at && at < span.end)

const paragraphRuns = (
  node: DesignNode,
  className: string,
  start: number,
  end: number
): CodeTextRun[] => {
  const boundaries = runBoundaries(start, end, node.spans)
  const runs = boundaries.slice(0, -1).map((from, index): CodeTextRun => {
    const to = boundaries[index + 1] ?? end
    const spanIndex = spanAt(node.spans, from)
    const span = node.spans[spanIndex]
    return span
      ? {
          text: node.text.slice(from, to),
          className: `${className}-span-${spanIndex + 1}`,
          style: spanStyle(span)
        }
      : { text: node.text.slice(from, to), style: [] }
  })
  return runs.length === 0 ? [{ text: '', style: [] }] : runs
}

/**
 * Splits a text into paragraphs at its line breaks, and each paragraph into runs at its spans, so a
 * span becomes an element of its own with its weight, style or colour.
 * @param node - The text node.
 * @param className - The text element's class; a span's class extends it.
 * @returns The paragraphs, each a list of runs.
 */
export const getTextParagraphs = (node: DesignNode, className: string): CodeTextRun[][] => {
  const lines = node.text.split('\n')
  return lines.map((line, index) => {
    const start = lines.slice(0, index).reduce((total, previous) => total + previous.length + 1, 0)
    return paragraphRuns(node, className, start, start + line.length)
  })
}
