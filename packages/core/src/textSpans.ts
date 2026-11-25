import type { DesignNode, DesignNodePatch, TextFace, TextSpan } from './types.ts'

/**
 * Cuts spans to a text of a given length, dropping the ones left empty, so editing the words of a
 * text never leaves a span pointing past the end.
 * @param spans - The spans, in order.
 * @param length - The text's length in UTF-16 units.
 * @returns The spans that still cover something.
 */
export const clampTextSpans = (spans: readonly TextSpan[], length: number): TextSpan[] =>
  spans
    .map((span) => ({
      ...span,
      start: Math.min(span.start, length),
      end: Math.min(span.end, length)
    }))
    .filter((span) => span.end > span.start)

/**
 * Keeps a patch that changes the words without naming spans from leaving them stale: the spans are
 * cut to the new length.
 * @param patch - The properties being changed.
 * @param node - The node they apply to.
 * @returns The patch, with `spans` added when the text changed on its own.
 */
export const clampSpansToText = (patch: DesignNodePatch, node: DesignNode): DesignNodePatch =>
  patch.text !== undefined && patch.spans === undefined && node.spans.length > 0
    ? { ...patch, spans: clampTextSpans(node.spans, patch.text.length) }
    : patch

/**
 * Says what is wrong with a text node's spans.
 * @param node - The node.
 * @returns The problem, or undefined when the spans are ordered, apart and inside the text.
 */
export const checkTextSpans = (
  node: Pick<DesignNode, 'id' | 'text' | 'spans'>
): string | undefined => {
  const bad = node.spans.find(
    (span, index) =>
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < 0 ||
      span.end <= span.start ||
      span.end > node.text.length ||
      span.start < (node.spans[index - 1]?.end ?? 0)
  )
  return bad
    ? `Node ${node.id} has a span from ${bad.start} to ${bad.end} that is empty, out of order, overlapping or past the end of its ${node.text.length} characters`
    : undefined
}

/**
 * The font a span is drawn in: the node's, with the weight and style the span sets.
 * @param node - The text node.
 * @param span - One of its spans.
 * @returns The family, weight and style that pick the font file.
 */
export const getSpanFace = (
  node: Pick<DesignNode, 'fontFamily' | 'fontWeight' | 'fontStyle'>,
  span: TextSpan
): TextFace => ({
  fontFamily: node.fontFamily,
  fontWeight: span.fontWeight ?? node.fontWeight,
  fontStyle: span.fontStyle ?? node.fontStyle
})
