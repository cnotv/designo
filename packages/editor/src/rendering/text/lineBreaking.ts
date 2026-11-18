import type { BreakChunk, MeasuredWidths } from './types.ts'

const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' })
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

// Float sums of advances can miss a box's width by a hair, which must not wrap a line that fits.
export const FIT_TOLERANCE = 1e-6

// Spaces a line may break at; the no-break spaces are left out because they exist to stop a break.
const BREAKING_SPACE_PATTERN = /^[^\S\u00a0\u2007\u202f]+$/
const HARD_BREAK_PATTERN = /\r\n|[\n\r\u2028\u2029]/g

export interface Paragraph {
  text: string
  /** UTF-16 offset of the paragraph in the whole text. */
  start: number
}

/**
 * Splits text at hard line breaks. The breaks themselves belong to no paragraph.
 * @param text - The whole text.
 * @returns The paragraphs in order, with where each starts; one empty paragraph for empty text.
 */
export const splitParagraphs = (text: string): Paragraph[] => {
  const breaks = [...text.matchAll(HARD_BREAK_PATTERN)]
  const starts = [0, ...breaks.map((match) => match.index + match[0].length)]
  const ends = [...breaks.map((match) => match.index), text.length]
  return starts.map((start, index) => ({ text: text.slice(start, ends[index]), start }))
}

/**
 * Finds the pieces a paragraph can be wrapped in. A line breaks after spaces, and between words
 * of a script written without them, using the Unicode word boundaries from `Intl.Segmenter`;
 * punctuation stays with the word it touches.
 * @param paragraph - One paragraph, with no hard line breaks.
 * @returns The chunks in order, covering the paragraph.
 */
export const findBreakChunks = (paragraph: string): BreakChunk[] =>
  [...wordSegmenter.segment(paragraph)].reduce<{ chunks: BreakChunk[]; previousWasWord: boolean }>(
    ({ chunks, previousWasWord }, segment) => {
      const end = segment.index + segment.segment.length
      const last = chunks.at(-1)
      if (BREAKING_SPACE_PATTERN.test(segment.segment)) {
        const spaced = last
          ? [...chunks.slice(0, -1), { ...last, end }]
          : [{ start: 0, contentEnd: 0, end }]
        return { chunks: spaced, previousWasWord: false }
      }
      const startsNewChunk =
        !last || last.contentEnd < last.end || (previousWasWord && !!segment.isWordLike)
      const chunk = startsNewChunk
        ? { start: segment.index, contentEnd: end, end }
        : { ...last, contentEnd: end, end }
      return {
        chunks: [...(startsNewChunk ? chunks : chunks.slice(0, -1)), chunk],
        previousWasWord: !!segment.isWordLike
      }
    },
    { chunks: [], previousWasWord: false }
  ).chunks

/**
 * Cuts a word wider than the box into pieces that each fit, at character boundaries that keep a
 * letter with its combining marks. A single character wider than the box gets a line of its own.
 * @param paragraphText - The paragraph the chunk belongs to.
 * @param chunk - The word, as offsets in the paragraph.
 * @param wrapWidth - The width of the box.
 * @param measureRange - The width of a stretch of the paragraph, as offsets.
 * @returns The offsets where each piece ends; the last is the end of the word's content.
 */
export const findGraphemeCuts = (
  paragraphText: string,
  chunk: BreakChunk,
  wrapWidth: number,
  measureRange: (start: number, end: number) => number
): number[] => {
  const graphemeEnds = [
    ...graphemeSegmenter.segment(paragraphText.slice(chunk.start, chunk.contentEnd))
  ].map((grapheme) => chunk.start + grapheme.index + grapheme.segment.length)
  const final = graphemeEnds.reduce<{ cuts: number[]; start: number; lastEnd: number }>(
    ({ cuts, start, lastEnd }, graphemeEnd) => {
      const fits =
        lastEnd === start || measureRange(start, graphemeEnd) <= wrapWidth + FIT_TOLERANCE
      return fits
        ? { cuts, start, lastEnd: graphemeEnd }
        : { cuts: [...cuts, lastEnd], start: lastEnd, lastEnd: graphemeEnd }
    },
    { cuts: [], start: chunk.start, lastEnd: chunk.start }
  )
  return [...final.cuts, final.lastEnd]
}

/**
 * Fills lines greedily: a chunk joins the line while its content fits, and its trailing spaces
 * count toward what the next chunk has left, though they may hang past the edge.
 * @param chunks - The measured chunks of a paragraph, in order.
 * @param wrapWidth - The width of the box, or undefined for one line however long.
 * @returns The chunks of each line.
 */
export const fillLines = <Chunk extends MeasuredWidths>(
  chunks: readonly Chunk[],
  wrapWidth: number | undefined
): Chunk[][] =>
  chunks.reduce<{ lines: Chunk[][]; advance: number }>(
    ({ lines, advance }, chunk) => {
      const current = lines.at(-1)
      const fitsOnLine =
        current !== undefined &&
        (wrapWidth === undefined || advance + chunk.contentWidth <= wrapWidth + FIT_TOLERANCE)
      const chunkAdvance = chunk.contentWidth + chunk.trailingWidth
      return fitsOnLine
        ? { lines: [...lines.slice(0, -1), [...current, chunk]], advance: advance + chunkAdvance }
        : { lines: [...lines, [chunk]], advance: chunkAdvance }
    },
    { lines: [], advance: 0 }
  ).lines
