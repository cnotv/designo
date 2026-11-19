import { exportDocumentToPdf } from '@designo/exporter/pdf'
import { describe, expect, it } from 'vitest'
import { BOOK_SAMPLE_PAGE_COUNT, createBookSampleDocument } from './bookSample.ts'

describe('createBookSampleDocument', () => {
  it('numbers one frame for each page in reading order and leaves the board out', () => {
    const { nodes } = createBookSampleDocument()
    const numbers = Object.values(nodes)
      .filter((node) => node.pdfPage !== null)
      .map((node) => node.pdfPage)
    expect(numbers).toEqual(Array.from({ length: BOOK_SAMPLE_PAGE_COUNT }, (_, index) => index + 1))
    expect(nodes.board?.pdfPage).toBeNull()
  })

  it('exports one PDF page for each numbered frame', async () => {
    const document = createBookSampleDocument()
    const bytes = await exportDocumentToPdf(
      {
        ...document,
        nodes: Object.fromEntries(
          Object.entries(document.nodes).filter(([, node]) => node.type !== 'text')
        )
      },
      { getTextLayout: () => undefined, getFontBytes: () => undefined }
    )
    const source = new TextDecoder('latin1').decode(bytes)
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(BOOK_SAMPLE_PAGE_COUNT)
  })
})
