import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignOperation
} from '@designo/core'

/** How many spreads the sample has, each one a page of the PDF. */
export const BOOK_SAMPLE_PAGE_COUNT = 12

const PAGE_SIZE = 480
const COLUMNS = 4
const GAP = 80
const PAGE_COLORS = ['#f5f1e3', '#dfe9d8', '#d5e4e1', '#f1e1bb', '#f0d5d0', '#d6dde9']
const BOARD_LEFT = -PAGE_SIZE * 2 - GAP

const pageOperations = (index: number): DesignOperation[] => {
  const column = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  const id = `spread-${index + 1}`
  return [
    {
      kind: 'create',
      id,
      type: 'frame',
      parentId: 'canvas',
      properties: {
        name: `Page ${index + 1}`,
        x: column * (PAGE_SIZE + GAP),
        y: row * (PAGE_SIZE + GAP),
        width: PAGE_SIZE,
        height: PAGE_SIZE,
        fill: PAGE_COLORS[index % PAGE_COLORS.length] ?? '#ffffff',
        pdfPage: index + 1
      }
    },
    {
      kind: 'create',
      id: `${id}-title`,
      type: 'text',
      parentId: id,
      properties: {
        x: column * (PAGE_SIZE + GAP) + 48,
        y: row * (PAGE_SIZE + GAP) + 48,
        text: `Page ${index + 1}`,
        fontSize: 34,
        fill: '#2b3a2f'
      }
    }
  ]
}

// Left out of the PDF on purpose: it has no pdfPage, as an art direction board would not.
const boardOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'board',
    type: 'frame',
    parentId: 'canvas',
    properties: {
      name: 'Art direction (not a page)',
      x: BOARD_LEFT,
      y: 0,
      width: PAGE_SIZE * 2,
      height: PAGE_SIZE,
      fill: '#ffffff'
    }
  },
  {
    kind: 'create',
    id: 'board-title',
    type: 'text',
    parentId: 'board',
    properties: {
      x: BOARD_LEFT + 48,
      y: 48,
      text: 'Art direction: not in the PDF',
      fontSize: 28,
      fill: '#2b3a2f'
    }
  }
]

/**
 * Builds a picture book laid out as spreads on one design page, to try the PDF export with: a
 * frame for each page, numbered with `pdfPage` in reading order, and one board that is no page.
 * The export should have exactly BOOK_SAMPLE_PAGE_COUNT pages, each as large as its frame.
 * @returns The document.
 */
export const createBookSampleDocument = (): DesignDocument => {
  const result = applyOperations(createDocument('book-sample', 'Book sample', 'canvas'), [
    ...Array.from({ length: BOOK_SAMPLE_PAGE_COUNT }, (_, index) => pageOperations(index)).flat(),
    ...boardOperations()
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}
