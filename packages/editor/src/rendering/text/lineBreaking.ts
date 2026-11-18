import type { BreakChunk } from './types.ts'

const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' })

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
