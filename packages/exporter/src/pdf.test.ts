import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  getPageNodes,
  createDocument,
  type DesignDocument,
  type DesignOperation
} from '@designo/core'
import { toTextLayoutRequest, loadTextLayout, createTextEngine } from '@designo/text'
import {
  FIXTURE_FONT_CATALOG,
  createFixtureFontLibrary,
  readFixtureFontBytes
} from '@designo/text/fixtures'
import { exportDocumentToPdf } from './pdf.ts'
import type { PdfExportOptions } from './types.ts'

const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (character) => character.charCodeAt(0)
)

const build = (document: DesignDocument, operations: DesignOperation[]): DesignDocument => {
  const result = applyOperations(document, operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const library = createFixtureFontLibrary()
const engine = createTextEngine({ library })
const fontBytes = new Map(
  await Promise.all(
    FIXTURE_FONT_CATALOG.fonts.map(
      async (font) => [font.id, await readFixtureFontBytes(font.url)] as const
    )
  )
)

const optionsFor = async (document: DesignDocument): Promise<PdfExportOptions> => {
  const texts = Object.values(document.nodes).filter((node) => node.type === 'text')
  const layouts = new Map(
    await Promise.all(
      texts.map(
        async (node) =>
          [node.id, await loadTextLayout({ library, engine }, toTextLayoutRequest(node))] as const
      )
    )
  )
  return {
    getTextLayout: (node) => layouts.get(node.id),
    getFontBytes: (fontId) => fontBytes.get(fontId)
  }
}

const asText = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes)
const countMatches = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0

const twoPageDocument = (): DesignDocument =>
  build(createDocument('file', 'Book', 'page'), [
    { kind: 'createPage', id: 'second' },
    {
      kind: 'create',
      id: 'one',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 0, y: 0, width: 200, height: 100, fill: '#ff0000' }
    },
    {
      kind: 'create',
      id: 'two',
      type: 'rectangle',
      parentId: 'second',
      properties: { x: 0, y: 0, width: 300, height: 150, fill: '#0000ff' }
    }
  ])

describe('exportDocumentToPdf', () => {
  describe('frames marked as pages', () => {
    const bookDocument = (): DesignDocument =>
      build(createDocument('file', 'Book', 'page'), [
        {
          kind: 'create',
          id: 'board',
          type: 'frame',
          parentId: 'page',
          properties: { x: 0, y: 0, width: 900, height: 900 }
        },
        {
          kind: 'create',
          id: 'spread-two',
          type: 'frame',
          parentId: 'page',
          properties: { x: 1000, y: 0, width: 300, height: 150, pdfPage: 2 }
        },
        {
          kind: 'create',
          id: 'spread-one',
          type: 'frame',
          parentId: 'page',
          properties: { x: 0, y: 1000, width: 200, height: 100, pdfPage: 1 }
        }
      ])

    it('writes one PDF page for each marked frame, in order, at the frame size', async () => {
      const document = bookDocument()
      const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
      expect(countMatches(pdf, /\/Type \/Page\b/g)).toBe(2)
      expect(
        [...pdf.matchAll(/\/MediaBox \[0 0 (\d+) (\d+)]/g)].map((match) => match.slice(1))
      ).toEqual([
        ['200', '100'],
        ['300', '150']
      ])
    })

    it('ignores the mark on anything that is not a frame', async () => {
      const document = build(bookDocument(), [
        { kind: 'update', id: 'spread-one', patch: { pdfPage: null } },
        { kind: 'update', id: 'spread-two', patch: { pdfPage: null } },
        {
          kind: 'create',
          id: 'box',
          type: 'rectangle',
          parentId: 'page',
          properties: { x: 0, y: 0, width: 50, height: 50, pdfPage: 1 }
        }
      ])
      const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
      expect(countMatches(pdf, /\/Type \/Page\b/g)).toBe(1)
      expect(pdf).toContain('/MediaBox [0 0 1300 1100]')
    })
  })

  it('writes one PDF page for each page, in order, sized to its content', async () => {
    const document = twoPageDocument()
    const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
    expect(pdf.startsWith('%PDF')).toBe(true)
    expect(getPageNodes(document).map((page) => page.id)).toEqual(['page', 'second'])
    expect(countMatches(pdf, /\/Type \/Page\b/g)).toBe(2)
    expect(
      [...pdf.matchAll(/\/MediaBox \[0 0 (\d+) (\d+)]/g)].map((match) => match.slice(1))
    ).toEqual([
      ['200', '100'],
      ['300', '150']
    ])
  })

  it('embeds the font a text uses and keeps it selectable', async () => {
    const document = build(createDocument('file', 'Text', 'page'), [
      {
        kind: 'create',
        id: 'title',
        type: 'text',
        parentId: 'page',
        properties: { text: 'Hello', fontFamily: 'Inter', fontSize: 24, fill: '#000000' }
      }
    ])
    const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
    expect(countMatches(pdf, /\/FontFile2/g)).toBe(1)
    expect(pdf).toContain('/ToUnicode')
  })

  it('embeds each font of a line that mixes fallback fonts', async () => {
    const document = build(createDocument('file', 'Text', 'page'), [
      {
        kind: 'create',
        id: 'title',
        type: 'text',
        parentId: 'page',
        properties: { text: 'Hello שלום', fontFamily: 'Inter', fontSize: 24, fill: '#000000' }
      }
    ])
    const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
    expect(countMatches(pdf, /\/FontFile2/g)).toBe(2)
  })

  it('draws gradients, clipping frames and blend modes as PDF', async () => {
    const document = build(createDocument('file', 'Effects', 'page'), [
      {
        kind: 'create',
        id: 'frame',
        type: 'frame',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 100, height: 100, fill: '#ffffff' }
      },
      {
        kind: 'create',
        id: 'blend',
        type: 'rectangle',
        parentId: 'frame',
        properties: { width: 80, height: 80, fill: '#ff0000', blendMode: 'multiply' }
      },
      {
        kind: 'create',
        id: 'sky',
        type: 'ellipse',
        parentId: 'frame',
        properties: {
          width: 60,
          height: 40,
          gradient: {
            kind: 'radial',
            angle: 0,
            stops: [
              { offset: 0, color: '#ffffff' },
              { offset: 1, color: '#0000ff80' }
            ]
          }
        }
      }
    ])
    const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
    expect(pdf).toContain('/BM /Multiply')
    expect(pdf).toContain('/ShadingType 3')
  })

  it('draws a node with blur or a shadow as the image it is given, and sharp without one', async () => {
    const document = build(createDocument('file', 'Blur', 'page'), [
      {
        kind: 'create',
        id: 'soft',
        type: 'rectangle',
        parentId: 'page',
        properties: { width: 50, height: 50, fill: '#00ff00', blur: 4 }
      }
    ])
    const options = await optionsFor(document)
    const asked: string[] = []
    const withImage = asText(
      await exportDocumentToPdf(document, {
        ...options,
        rasterizeNode: (nodeId) => {
          asked.push(nodeId)
          return Promise.resolve(ONE_PIXEL_PNG)
        }
      })
    )
    expect(asked).toEqual(['soft'])
    expect(withImage).toContain('/Subtype /Image')
    expect(asText(await exportDocumentToPdf(document, options))).not.toContain('/Subtype /Image')
  })
})
