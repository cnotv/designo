import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import {
  applyOperations,
  getPageNodes,
  millimetresToPoints,
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

// The page content is deflated, so what is drawn is read from the inflated streams.
const contentOf = (bytes: Uint8Array): string =>
  [...asLatin1(bytes).matchAll(/stream\r?\n([\S\s]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString('latin1')
      } catch {
        return ''
      }
    })
    .join('\n')

// TextDecoder's latin1 is windows-1252, which would corrupt deflated bytes above 0x7f.
const asLatin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1')

const asText = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes)
const countMatches = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0

// Reads the text layer back the way a parser does: each text object's glyph ids through the
// ToUnicode map of its font, joined in drawing order.
const decodeStreams = (source: string): Map<number, string> =>
  new Map(
    [...source.matchAll(/(\d+) 0 obj\s*<<\s*\/Length (\d+)([^>]*)>>\s*stream\r?\n/g)].flatMap(
      (match) => {
        const [header, id, length, rest] = match
        const start = (match.index ?? 0) + (header?.length ?? 0)
        const data = Buffer.from(source.slice(start, start + Number(length)), 'latin1')
        const body = rest?.includes('FlateDecode') ? inflateSync(data).toString('latin1') : ''
        return [[Number(id), body] as const]
      }
    )
  )

const parseToUnicode = (cmap: string): Map<string, string> => {
  const hexToText = (hex: string): string => String.fromCodePoint(Number.parseInt(hex, 16))
  const ranges = [...cmap.matchAll(/<(\w+)>\s*<(\w+)>\s*\[([^\]]*)]/g)].flatMap(
    ([, from, , list]) =>
      [...(list ?? '').matchAll(/<(\w+)>/g)].map(
        ([, target], index) =>
          [
            (Number.parseInt(from ?? '0', 16) + index).toString(16).padStart(4, '0'),
            hexToText(target ?? '0')
          ] as const
      )
  )
  const chars = [...cmap.matchAll(/<(\w{4})>\s*<(\w+)>(?!\s*[<[])/g)].map(
    ([, from, target]) => [from ?? '', hexToText(target ?? '0')] as const
  )
  return new Map([...ranges, ...chars])
}

const extractPdfText = (bytes: Uint8Array): { runs: string[]; text: string } => {
  const source = Buffer.from(bytes).toString('latin1')
  const streams = decodeStreams(source)
  const fonts = new Map(
    [...source.matchAll(/\/(F\d+) (\d+) 0 R/g)].map(([, name, id]) => {
      const font = source.match(new RegExp(`${id} 0 obj[^]*?/ToUnicode (\\d+) 0 R`))
      return [name ?? '', parseToUnicode(streams.get(Number(font?.[1])) ?? '')] as const
    })
  )
  const content = [...streams.values()].filter((body) => body.includes('BT')).join('\n')
  const runs = [...content.matchAll(/BT([^]*?)ET/g)].map(([, block = '']) => {
    const map = fonts.get(block.match(/\/(F\d+) /)?.[1] ?? '')
    const hex = [...block.matchAll(/<(\w+)>/g)].map(([, glyphs = '']) => glyphs).join('')
    return (hex.match(/.{4}/g) ?? []).map((glyph) => map?.get(glyph) ?? '?').join('')
  })
  return { runs, text: runs.join('') }
}

// What a reader built on pdf.js sees: the strings of its text items, page by page.
const readTextItems = async (bytes: Uint8Array): Promise<string[]> => {
  const pdf = await getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false }).promise
  const page = await pdf.getPage(1)
  const content = await page.getTextContent()
  return content.items.flatMap((item) => ('str' in item ? [item.str] : []))
}

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

const BLEED = millimetresToPoints(3)

const readBox = (pdf: string, name: string): number[] =>
  (new RegExp(`/${name} \\[([^\\]]+)]`).exec(pdf)?.[1] ?? '').split(' ').map(Number)

describe('exportDocumentToPdf', () => {
  describe('bleed and trim marks', () => {
    const bleedDocument = (bleed: number): DesignDocument =>
      build(createDocument('file', 'Print', 'page'), [
        {
          kind: 'create',
          id: 'sheet',
          type: 'frame',
          parentId: 'page',
          properties: { x: 40, y: 60, width: 200, height: 100, pdfPage: 1, bleed, fill: '#ff0000' }
        },
        {
          kind: 'create',
          id: 'art',
          type: 'rectangle',
          parentId: 'sheet',
          properties: { x: 40, y: 60, width: 200, height: 100, fill: '#00ff00' }
        }
      ])

    const exportPdf = async (bleed: number, trimMarks?: boolean): Promise<string> => {
      const document = bleedDocument(bleed)
      return asText(
        await exportDocumentToPdf(document, { ...(await optionsFor(document)), trimMarks })
      )
    }

    it('grows the page by the bleed and writes a bleed box and a trim box', async () => {
      const pdf = await exportPdf(BLEED)
      const media = readBox(pdf, 'MediaBox')
      const bleedBox = readBox(pdf, 'BleedBox')
      const trim = readBox(pdf, 'TrimBox')
      expect(media[2]).toBeCloseTo(200 + BLEED * 2, 3)
      expect(media[3]).toBeCloseTo(100 + BLEED * 2, 3)
      expect(bleedBox).toEqual(media)
      expect(trim[0]).toBeCloseTo(BLEED, 3)
      expect(trim[1]).toBeCloseTo(BLEED, 3)
      expect(trim[2]).toBeCloseTo(BLEED + 200, 3)
      expect(trim[3]).toBeCloseTo(BLEED + 100, 3)
    })

    it('writes no bleed or trim box for a page without bleed', async () => {
      const pdf = await exportPdf(0)
      expect(pdf).not.toContain('/BleedBox')
      expect(pdf).not.toContain('/TrimBox')
      expect(pdf).toContain('/MediaBox [0 0 200 100]')
    })

    it('fills and clips the page to the bleed edge, so the artwork reaches it', async () => {
      const document = bleedDocument(BLEED)
      const content = contentOf(await exportDocumentToPdf(document, await optionsFor(document)))
      const rectangles = [
        ...content.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)
      ].map((match) => match.slice(1).map(Number))
      const [left = 0, top = 0, width = 0, height = 0] = rectangles[0] ?? []
      expect(left).toBeCloseTo(40 - BLEED, 3)
      expect(top).toBeCloseTo(60 - BLEED, 3)
      expect(width).toBeCloseTo(200 + BLEED * 2, 3)
      expect(height).toBeCloseTo(100 + BLEED * 2, 3)
    })

    it('draws trim marks outside the bleed box, in a larger media box, only when asked', async () => {
      const plain = await exportPdf(BLEED)
      const marked = await exportPdf(BLEED, true)
      const [, , plainWidth = 0] = readBox(plain, 'MediaBox')
      const [, , markedWidth = 0] = readBox(marked, 'MediaBox')
      const [bleedLeft = 0, , bleedRight = 0] = readBox(marked, 'BleedBox')
      const [trimLeft = 0] = readBox(marked, 'TrimBox')
      expect(markedWidth).toBeGreaterThan(plainWidth)
      expect(bleedLeft).toBeGreaterThan(0)
      expect(bleedRight).toBeLessThan(markedWidth)
      expect(trimLeft - bleedLeft).toBeCloseTo(BLEED, 3)
    })

    it('draws eight mark lines, two at each corner, and none without the option', async () => {
      const document = bleedDocument(BLEED)
      const options = await optionsFor(document)
      const countStrokes = async (trimMarks: boolean): Promise<number> =>
        countMatches(
          contentOf(await exportDocumentToPdf(document, { ...options, trimMarks })),
          /\bS\b/g
        )
      expect((await countStrokes(true)) - (await countStrokes(false))).toBe(8)
    })
  })

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

  it('defines the graphics state on every page that selects it', async () => {
    const document = twoPageDocument()
    const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
    // Both pages paint a fill, which selects a graphics state with `gs` in the (compressed) content.
    expect(countMatches(pdf, /\/ExtGState <</g)).toBe(2)
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

  it('writes a sentence as words with real spaces, so the extracted text is the node text', async () => {
    const sentence = 'Senior Frontend Engineer with 15 years of experience'
    const document = build(createDocument('file', 'Text', 'page'), [
      {
        kind: 'create',
        id: 'title',
        type: 'text',
        parentId: 'page',
        properties: { text: sentence, fontFamily: 'Inter', fontSize: 24, fill: '#000000' }
      }
    ])
    const { runs, text } = extractPdfText(
      await exportDocumentToPdf(document, await optionsFor(document))
    )
    expect(text).toBe(sentence)
    expect(runs).toHaveLength(sentence.split(' ').length)
  })

  it('keeps each space inside the run of its word, and ends a wrapped line on a letter', async () => {
    const document = build(createDocument('file', 'Text', 'page'), [
      {
        kind: 'create',
        id: 'paragraph',
        type: 'text',
        parentId: 'page',
        properties: {
          text: 'Senior Frontend Engineer with 15 years of experience building design tools',
          fontFamily: 'Inter',
          fontSize: 24,
          fill: '#000000',
          width: 200,
          textWrap: true
        }
      }
    ])
    const options = await optionsFor(document)
    const lineCount = options.getTextLayout(document.nodes['paragraph']!)?.lines.length
    const { runs } = extractPdfText(await exportDocumentToPdf(document, options))
    const items = await readTextItems(await exportDocumentToPdf(document, options))
    expect(lineCount).toBeGreaterThan(1)
    expect(runs.some((run) => run.trim() === '')).toBe(false)
    // A reader built on pdf.js keeps the words apart and sees no space at a line end.
    expect(items.some((item) => item.trim() === '')).toBe(false)
    expect(items.every((item) => item === item.trimEnd())).toBe(true)
    expect(items.join(' ')).toContain('Senior Frontend Engineer with 15 years of')
    // Only the last word of each line is without its trailing space.
    expect(runs.filter((run) => !run.endsWith(' '))).toHaveLength(lineCount ?? 0)
  })

  it('paints a span in its own colour and the rest in the fill of the node', async () => {
    const document = build(createDocument('file', 'Text', 'page'), [
      {
        kind: 'create',
        id: 'title',
        type: 'text',
        parentId: 'page',
        properties: {
          text: 'ab cd',
          fontFamily: 'Inter',
          fontSize: 24,
          fill: '#0000ff',
          spans: [{ start: 3, end: 5, fill: '#ff0000' }]
        }
      }
    ])
    const content = contentOf(await exportDocumentToPdf(document, await optionsFor(document)))
    expect(content).toMatch(/0 0 1 (rg|sc)/)
    expect(content).toMatch(/1 0 0 (rg|sc)/)
  })

  it('draws a list marker for each paragraph as selectable text, apart from its words', async () => {
    const document = build(createDocument('file', 'Text', 'page'), [
      {
        kind: 'create',
        id: 'list',
        type: 'text',
        parentId: 'page',
        properties: {
          text: 'one\ntwo',
          fontFamily: 'Inter',
          fontSize: 24,
          fill: '#000000',
          listStyle: 'number'
        }
      }
    ])
    const { runs } = extractPdfText(await exportDocumentToPdf(document, await optionsFor(document)))
    expect(runs).toHaveLength(4)
    expect(runs.join('|')).toContain('1.')
    expect(runs.join('|')).toContain('2.')
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

  describe('images', () => {
    const PNG_ID = `${'b'.repeat(64)}.png`
    const WEBP_ID = `${'c'.repeat(64)}.webp`
    const imageDocument = (imageAsset: string): DesignDocument =>
      build(createDocument('file', 'Pictures', 'page'), [
        {
          kind: 'create',
          id: 'photo',
          type: 'image',
          parentId: 'page',
          properties: { x: 0, y: 0, width: 80, height: 60, imageAsset }
        }
      ])

    it('embeds a PNG as an image', async () => {
      const document = imageDocument(PNG_ID)
      const pdf = asText(
        await exportDocumentToPdf(document, {
          ...(await optionsFor(document)),
          getImageBytes: () => ONE_PIXEL_PNG
        })
      )
      expect(pdf).toContain('/Subtype /Image')
    })

    it('asks the rasterizer for a WebP, which the PDF cannot embed as it is', async () => {
      const document = imageDocument(WEBP_ID)
      const asked: string[] = []
      const pdf = asText(
        await exportDocumentToPdf(document, {
          ...(await optionsFor(document)),
          getImageBytes: () => Uint8Array.from([1, 2, 3]),
          rasterizeNode: (nodeId) => {
            asked.push(nodeId)
            return Promise.resolve(ONE_PIXEL_PNG)
          }
        })
      )
      expect(asked).toEqual(['photo'])
      expect(pdf).toContain('/Subtype /Image')
    })

    it('draws the fill when the picture is not available', async () => {
      const document = imageDocument(PNG_ID)
      const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
      expect(pdf).not.toContain('/Subtype /Image')
    })
  })
  describe('links', () => {
    const linked = (
      type: 'text' | 'rectangle' | 'frame' | 'ellipse',
      properties: Record<string, unknown>
    ): DesignDocument =>
      build(createDocument('file', 'Links', 'page'), [
        { kind: 'create', id: 'node', type, parentId: 'page', properties }
      ])

    const exportOf = async (document: DesignDocument): Promise<string> =>
      asText(await exportDocumentToPdf(document, await optionsFor(document)))

    it('writes a link annotation with a URI action over a rectangle', async () => {
      const pdf = await exportOf(
        linked('rectangle', { x: 10, y: 20, width: 30, height: 40, link: 'https://example.com/cv' })
      )
      expect(countMatches(pdf, /\/Subtype \/Link/g)).toBe(1)
      expect(pdf).toContain('/S /URI')
      expect(pdf).toContain('/URI (https://example.com/cv)')
      // The page starts at the content, so the box sits at its corner.
      expect(pdf).toContain('/Rect [0 0 30 40]')
    })

    it('links a frame and a mailto address', async () => {
      const pdf = await exportOf(linked('frame', { link: 'mailto:me@example.com' }))
      expect(pdf).toContain('/URI (mailto:me@example.com)')
    })

    it('writes no annotation for a node without a link', async () => {
      expect(await exportOf(linked('rectangle', {}))).not.toContain('/Subtype /Link')
    })

    it('leaves an ellipse alone, as it cannot carry a link', async () => {
      const document = linked('ellipse', {})
      const withLink = {
        ...document,
        nodes: { ...document.nodes, node: { ...document.nodes.node!, link: 'https://example.com' } }
      }
      expect(await exportOf(withLink)).not.toContain('/Subtype /Link')
    })

    it('writes a link annotation over each line of a wrapped text', async () => {
      const document = linked('text', {
        text: 'one two three four five six seven eight nine ten',
        fontFamily: 'Inter',
        fontSize: 24,
        fill: '#000000',
        textWrap: true,
        width: 120,
        link: 'tel:+49 170 1234567'
      })
      const options = await optionsFor(document)
      const lines = options.getTextLayout(document.nodes.node!)?.lines.length ?? 0
      expect(lines).toBeGreaterThan(1)
      const pdf = asText(await exportDocumentToPdf(document, options))
      expect(countMatches(pdf, /\/Subtype \/Link/g)).toBe(lines)
    })

    it('escapes a parenthesis in the address', async () => {
      const pdf = await exportOf(linked('rectangle', { link: 'https://example.com/a_(b)' }))
      expect(pdf).toContain('/URI (https://example.com/a_\\(b\\))')
    })

    it('keeps the link over the box a rotation gives', async () => {
      const pdf = await exportOf(
        linked('rectangle', {
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          rotation: 90,
          link: 'https://example.com'
        })
      )
      // 100 by 20 turned a quarter: the box is 20 wide and 100 tall.
      expect(pdf).toContain('/Rect [0 0 20 100]')
    })
  })

  describe('document metadata', () => {
    const exportWith = async (document: DesignDocument): Promise<string> =>
      asText(await exportDocumentToPdf(document, await optionsFor(document)))

    it('titles the PDF with the file name when no title is set', async () => {
      expect(await exportWith(twoPageDocument())).toContain('(Book)')
    })

    it('writes the title, author and subject to the info dictionary and the XMP', async () => {
      const document = build(twoPageDocument(), [
        {
          kind: 'updateMetadata',
          patch: { title: 'Jane Doe, CV', author: 'Jane Doe', subject: 'Application' }
        }
      ])
      const pdf = await exportWith(document)
      expect(pdf).toContain('(Jane Doe, CV)')
      expect(pdf).toContain('(Jane Doe)')
      expect(pdf).toContain('(Application)')
      expect(pdf).toContain('<dc:title>')
      expect(pdf).toContain('<rdf:li>Jane Doe</rdf:li>')
    })

    it('writes the language as the catalog Lang, and none when it is not set', async () => {
      const withLanguage = build(twoPageDocument(), [
        { kind: 'updateMetadata', patch: { language: 'de-DE' } }
      ])
      expect(await exportWith(withLanguage)).toContain('/Lang (de-DE)')
      expect(await exportWith(twoPageDocument())).not.toContain('/Lang')
    })

    it('escapes markup characters in the XMP only', async () => {
      const document = build(twoPageDocument(), [
        { kind: 'updateMetadata', patch: { title: 'Fish & <Chips>' } }
      ])
      const pdf = await exportWith(document)
      expect(pdf).toContain('(Fish & <Chips>)')
      expect(pdf).toContain('Fish &amp; &lt;Chips&gt;')
    })
  })

  describe('tagged structure', () => {
    const taggedDocument = (): DesignDocument =>
      build(createDocument('file', 'Doc', 'page'), [
        {
          kind: 'create',
          id: 'frame',
          type: 'frame',
          parentId: 'page',
          properties: { width: 300, height: 300 }
        },
        ...['heading', 'intro', 'first', 'second'].map((id, index): DesignOperation => ({
          kind: 'create',
          id,
          type: 'text',
          parentId: 'frame',
          properties: {
            text: id,
            x: 10,
            y: 10 + index * 30,
            fill: '#000000',
            pdfTag: (['h2', 'p', 'li', 'li'] as const)[index]
          }
        }))
      ])

    it('is not tagged when no text has a tag', async () => {
      const document = twoPageDocument()
      const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
      expect(pdf).not.toContain('/StructTreeRoot')
      expect(pdf).not.toContain('/MarkInfo')
    })

    it('marks the PDF as tagged and writes a structure element for each tagged text', async () => {
      const document = taggedDocument()
      const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
      expect(pdf).toContain('/Marked true')
      expect(pdf).toContain('/StructTreeRoot')
      expect(countMatches(pdf, /\/S \/H2\b/g)).toBe(1)
      expect(countMatches(pdf, /\/S \/P\b/g)).toBe(1)
    })

    it('groups list items into one list, in the order of the frame', async () => {
      const document = taggedDocument()
      const pdf = asText(await exportDocumentToPdf(document, await optionsFor(document)))
      expect(countMatches(pdf, /\/S \/L\b/g)).toBe(1)
      expect(countMatches(pdf, /\/S \/LI\b/g)).toBe(2)
      expect(countMatches(pdf, /\/S \/LBody\b/g)).toBe(2)
      const order = [...pdf.matchAll(/\/S \/(H2|P|L)\b/g)].map((match) => match[1])
      expect(order).toEqual(['H2', 'P', 'L'])
    })
  })
})
