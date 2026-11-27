import type { PdfPageFacts, PdfTextItem } from './types.ts'

// Two strings further apart than this share a line but not a column; a word space is far smaller.
const COLUMN_GAP_RATIO = 0.06
const LINE_TOLERANCE_RATIO = 0.5

/** One row of a page as a row-by-row reader sees it: strings at the same height, left to right. */
export interface PageLine {
  y: number
  /** The strings of the row, merged until a gap wide enough to be a column. */
  cells: readonly string[]
  text: string
}

const groupByHeight = (items: readonly PdfTextItem[]): PdfTextItem[][] =>
  items
    .toSorted((first, second) => first.y - second.y || first.x - second.x)
    .reduce<PdfTextItem[][]>((groups, item) => {
      const last = groups.at(-1)
      const reference = last?.[0]
      const sameRow =
        reference !== undefined &&
        Math.abs(item.y - reference.y) <=
          Math.max(1, Math.min(item.height, reference.height) * LINE_TOLERANCE_RATIO)
      return sameRow && last ? [...groups.slice(0, -1), [...last, item]] : [...groups, [item]]
    }, [])

const toCells = (row: readonly PdfTextItem[], gapLimit: number): string[] =>
  row
    .toSorted((first, second) => first.x - second.x)
    .reduce<{ text: string; end: number }[]>((cells, item) => {
      const last = cells.at(-1)
      return last && item.x - last.end <= gapLimit
        ? [...cells.slice(0, -1), { text: `${last.text} ${item.text}`, end: item.x + item.width }]
        : [...cells, { text: item.text, end: item.x + item.width }]
    }, [])
    .map((cell) => cell.text.replaceAll(/\s+/g, ' ').trim())
    .filter((text) => text !== '')

/**
 * Reads a page the way a row-by-row reader does: strings at the same height are one row, and a
 * wide gap inside a row starts another cell.
 * @param page - The page's text items.
 * @returns The rows from the top of the page down.
 */
export const getPageLines = (page: PdfPageFacts): PageLine[] =>
  groupByHeight(page.items.filter((item) => item.text.trim() !== ''))
    .map((row) => {
      const cells = toCells(row, page.width * COLUMN_GAP_RATIO)
      return { y: row[0]?.y ?? 0, cells, text: cells.join(' ') }
    })
    .filter((line) => line.text !== '')
