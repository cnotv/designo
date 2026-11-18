import { getTextBaselineOffset } from '@designo/text'
import {
  FIT_TOLERANCE,
  fillLines,
  findBreakChunks,
  findGraphemeCuts,
  splitParagraphs,
  type Paragraph
} from '@designo/text'
import type {
  BreakChunk,
  FallbackLine,
  FallbackTextInput,
  FallbackTextLayout,
  MeasuredWidths
} from '@designo/text'

type MeasureWidth = (text: string) => number

interface WidthChunk extends BreakChunk, MeasuredWidths {}

const measureChunk = (paragraph: Paragraph, chunk: BreakChunk, measure: MeasureWidth) => ({
  ...chunk,
  contentWidth: measure(paragraph.text.slice(chunk.start, chunk.contentEnd)),
  trailingWidth: measure(paragraph.text.slice(chunk.contentEnd, chunk.end))
})

const measureChunks = (
  paragraph: Paragraph,
  wrapWidth: number | undefined,
  measure: MeasureWidth
): WidthChunk[] =>
  findBreakChunks(paragraph.text).flatMap((chunk) => {
    const measured = measureChunk(paragraph, chunk, measure)
    if (wrapWidth === undefined || measured.contentWidth <= wrapWidth + FIT_TOLERANCE) {
      return [measured]
    }
    const cuts = findGraphemeCuts(paragraph.text, chunk, wrapWidth, (start, end) =>
      measure(paragraph.text.slice(start, end))
    )
    return cuts.map((cut, index) => {
      const start = index === 0 ? chunk.start : (cuts[index - 1] ?? chunk.start)
      const isLast = index === cuts.length - 1
      return measureChunk(
        paragraph,
        { start, contentEnd: cut, end: isLast ? chunk.end : cut },
        measure
      )
    })
  })

const breakParagraph = (
  paragraph: Paragraph,
  wrapWidth: number | undefined,
  measure: MeasureWidth
): { text: string; width: number }[] => {
  const chunks = measureChunks(paragraph, wrapWidth, measure)
  if (chunks.length === 0) return [{ text: '', width: 0 }]
  return fillLines(chunks, wrapWidth).map((lineChunks) => {
    const first = lineChunks[0]
    const last = lineChunks.at(-1)
    const text = paragraph.text.slice(first?.start ?? 0, last?.contentEnd ?? 0)
    // The line is measured whole, so kerning across its words counts, and its hanging spaces do not.
    return { text, width: measure(text) }
  })
}

const alignmentOffset = (
  alignment: FallbackTextInput['alignment'],
  boxWidth: number,
  lineWidth: number
): number => {
  if (alignment === 'center') return (boxWidth - lineWidth) / 2
  return alignment === 'right' ? boxWidth - lineWidth : 0
}

/**
 * Lays text out for the Canvas 2D path: the same breaking, box and baselines as the HarfBuzz
 * layout, with the browser measuring the text. It is the fallback while fonts load, for text the
 * bundled fonts cannot draw (emoji, CJK), and where WebGL2 or WebAssembly is missing, so it breaks
 * lines with the same chunks and the same greedy fill. It measures chunks apart and adds them, so
 * its lines can differ from the shaped layout by a kerning pair at a word boundary.
 * @param input - The text, wrap width, alignment, font size, line height and the font's metrics.
 * @param measureWidth - Measures a string's advance in the font, as `measureText` does.
 * @returns The lines with where each starts and sits, and the box they fill.
 */
export const layoutFallbackText = (
  input: FallbackTextInput,
  measureWidth: MeasureWidth
): FallbackTextLayout => {
  const { text, wrapWidth, alignment, fontSize, lineHeight, ascent, descent } = input
  const broken = splitParagraphs(text).flatMap((paragraph) =>
    breakParagraph(paragraph, wrapWidth, measureWidth)
  )
  const boxWidth = wrapWidth ?? Math.max(0, ...broken.map((line) => line.width))
  const lines = broken.map((line, lineIndex): FallbackLine => ({
    ...line,
    x: alignmentOffset(alignment, boxWidth, line.width),
    baselineY: getTextBaselineOffset(lineIndex, fontSize, lineHeight, ascent, descent)
  }))
  return { lines, width: boxWidth, height: lines.length * fontSize * lineHeight }
}
