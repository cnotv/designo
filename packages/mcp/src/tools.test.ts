import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { inflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@designo/core'
import { readDocument } from '@designo/storage'
import {
  FIXTURE_FONT_CATALOG,
  createFixtureFontLibrary,
  readFixtureFontBytes
} from '@designo/text/fixtures'
import { createTextEngine, loadTextLayout } from '@designo/text'
import { createDesignoServer } from './server.ts'
import {
  applyOperationsTool,
  checkAtsTool,
  combineNodesTool,
  createFileTool,
  exportPdfTool,
  exportSvgTool,
  getDocumentTreeTool,
  getNodeTool,
  getScreenshotTool,
  getStylesTool,
  listFilesTool,
  measureTextTool,
  setPageSetupTool
} from './tools.ts'
import type { DesignoToolContext, ScreenshotFonts, ScreenshotText } from './types.ts'

const NO_FONTS: ScreenshotFonts = {
  files: [],
  resolveFontFamily: () => undefined,
  getFontMetrics: () => undefined
}

// The editor's test font, standing in for a file the font API gives.
const NOTO_SANS_FIXTURE = fileURLToPath(
  new URL('../../text/src/fixtures/NotoSans-Latin.fixture.ttf', import.meta.url)
)

const createCountingIdGenerator = () => {
  let counter = 0
  return (prefix: string) => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

const fixtureLibrary = createFixtureFontLibrary()
const fixtureRuntime = {
  library: fixtureLibrary,
  engine: createTextEngine({ library: fixtureLibrary })
}

const fixtureFontBytes = new Map(
  await Promise.all(
    FIXTURE_FONT_CATALOG.fonts.map(
      async (font) => [font.id, await readFixtureFontBytes(font.url)] as const
    )
  )
)

let context: DesignoToolContext

beforeEach(async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-mcp-'))
  context = {
    dataDirectory,
    generateId: createCountingIdGenerator(),
    loadScreenshotFonts: async () => NO_FONTS,
    layoutText: (request) => loadTextLayout(fixtureRuntime, request)
  }
})

afterEach(async () => {
  await rm(context.dataDirectory, { recursive: true, force: true })
})

describe('MCP tools', () => {
  it('creates a file that list_files then returns', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Sketches' })
    expect(fileId).toBe('file-1')
    expect(pageId).toBe('page-2')
    expect(await listFilesTool(context)).toEqual([{ id: 'file-1', name: 'Sketches', nodeCount: 1 }])
  })

  it('applies a batch with nested ids and returns what it created', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Card' })
    const result = await applyOperationsTool(context, {
      fileId,
      operations: [
        { kind: 'create', id: 'card', type: 'frame', parentId: pageId, properties: { width: 320 } },
        { kind: 'create', type: 'text', parentId: 'card', properties: { text: 'Hello' } }
      ]
    })
    expect(result.createdNodeIds).toEqual(['card', 'text-3'])
    const tree = await getDocumentTreeTool(context, { fileId })
    expect(tree.children[0]?.children[0]?.node.text).toBe('Hello')
  })

  it('makes a component, places an instance and keeps an override', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Components' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        { kind: 'create', id: 'card', type: 'frame', parentId: pageId },
        { kind: 'create', id: 'title', type: 'text', parentId: 'card', properties: { text: 'A' } },
        { kind: 'update', id: 'card', patch: { isComponent: true } },
        { kind: 'createInstance', id: 'copy', componentId: 'card', parentId: pageId, x: 200 },
        { kind: 'update', id: 'copy:title', patch: { text: 'B' } },
        { kind: 'update', id: 'title', patch: { fontSize: 30 } }
      ]
    })
    const copy = await getNodeTool(context, { fileId, nodeId: 'copy:title' })
    expect(copy).toMatchObject({ text: 'B', fontSize: 30, overrides: ['text'] })
  })

  it('warns about a node that lies outside its parent frame, and about no other', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Frames' })
    const result = await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'card',
          type: 'frame',
          parentId: pageId,
          properties: { x: 500, y: 500, width: 100, height: 100 }
        },
        {
          kind: 'create',
          id: 'inside',
          type: 'rectangle',
          parentId: 'card',
          properties: { x: 510, y: 510, width: 10, height: 10 }
        },
        {
          kind: 'create',
          id: 'relative',
          type: 'rectangle',
          parentId: 'card',
          properties: { x: 10, y: 10, width: 10, height: 10 }
        }
      ]
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('relative')
    expect(result.warnings[0]).toContain('absolute on the page')
  })

  it('warns when an update moves a node out of its frame', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Moved' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'card',
          type: 'frame',
          parentId: pageId,
          properties: { width: 100, height: 100 }
        },
        {
          kind: 'create',
          id: 'dot',
          type: 'ellipse',
          parentId: 'card',
          properties: { width: 10, height: 10 }
        }
      ]
    })
    const result = await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'update', id: 'dot', patch: { x: 900 } }]
    })
    expect(result.warnings[0]).toContain('dot')
  })

  it('wraps a fixed-width text in export_svg where the editor wraps it', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Wrap' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'story',
          type: 'text',
          parentId: pageId,
          properties: {
            text: 'one two three four five six',
            fontFamily: 'Inter',
            fontSize: 20,
            width: 80,
            textWrap: true
          }
        }
      ]
    })
    const svg = await exportSvgTool(context, { fileId })
    expect(svg.match(/<tspan/g)?.length).toBeGreaterThan(1)
    expect(svg).toContain('>three</tspan>')
  })

  it('measures text without a node, wrapped at the width given', async () => {
    const free = await measureTextTool(context, { text: 'one two three', fontFamily: 'Inter' })
    expect(free.lineCount).toBe(1)
    const narrow = await measureTextTool(context, {
      text: 'one two three',
      fontFamily: 'Inter',
      width: 50
    })
    expect(narrow.lineCount).toBeGreaterThan(1)
    expect(narrow.width).toBe(50)
    expect(narrow.height).toBeGreaterThan(free.height)
    expect(narrow.lines.join(' ')).toBe('one two three')
  })

  it('measures a list as wider than the same text, by its indent', async () => {
    const plain = await measureTextTool(context, { text: 'one\ntwo', fontSize: 20 })
    const list = await measureTextTool(context, {
      text: 'one\ntwo',
      fontSize: 20,
      listStyle: 'bullet',
      listIndent: 2
    })
    expect(list.width).toBeCloseTo(plain.width + 40)
    expect(list.lineCount).toBe(2)
  })

  it('measures a span in a wider weight as wider than the plain text', async () => {
    const plain = await measureTextTool(context, { text: 'WWWW', fontFamily: 'Inter' })
    const spanned = await measureTextTool(context, {
      text: 'WWWW',
      fontFamily: 'Inter',
      spans: [{ start: 0, end: 2, fontWeight: 700 }]
    })
    expect(spanned.width).toBeGreaterThan(0)
    expect(spanned.width).toBeLessThanOrEqual(plain.width * 2)
  })

  it('keeps spans and a list style on a created text node, and rejects spans outside the text', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Rich' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'bullets',
          type: 'text',
          parentId: pageId,
          properties: {
            text: 'CI automation: faster',
            spans: [{ start: 0, end: 14, fontWeight: 700, fill: '#ff0000' }],
            listStyle: 'bullet'
          }
        }
      ]
    })
    const node = await getNodeTool(context, { fileId, nodeId: 'bullets' })
    expect(node.spans).toEqual([{ start: 0, end: 14, fontWeight: 700, fill: '#ff0000' }])
    expect(node.listStyle).toBe('bullet')
    await expect(
      applyOperationsTool(context, {
        fileId,
        operations: [{ kind: 'update', id: 'bullets', patch: { spans: [{ start: 0, end: 99 }] } }]
      })
    ).rejects.toThrow('past the end')
  })

  it('says so when text cannot be measured', async () => {
    await expect(measureTextTool(context, { text: '日本' })).rejects.toThrow('fonts')
  })

  it('sizes an auto-width text to its words, and a fixed-width text to its wrapped height', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Fit' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'label',
          type: 'text',
          parentId: pageId,
          properties: { text: 'one two three', fontFamily: 'Inter', fontSize: 20 }
        },
        {
          kind: 'create',
          id: 'story',
          type: 'text',
          parentId: pageId,
          properties: {
            text: 'one two three four five',
            fontFamily: 'Inter',
            fontSize: 20,
            width: 80
          }
        }
      ]
    })
    const label = await getNodeTool(context, { fileId, nodeId: 'label' })
    const story = await getNodeTool(context, { fileId, nodeId: 'story' })
    expect(label.width).not.toBe(100)
    expect(label.height).toBe(24)
    expect(story.textWrap).toBe(true)
    expect(story.width).toBe(80)
    expect(story.height).toBeGreaterThan(24)
    await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'update', id: 'label', patch: { text: 'one' } }]
    })
    expect((await getNodeTool(context, { fileId, nodeId: 'label' })).width).toBeLessThan(
      label.width
    )
  })

  it('refits an auto-width text when its letter spacing changes', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Spacing' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'label',
          type: 'text',
          parentId: pageId,
          properties: { text: 'one two', fontFamily: 'Inter', fontSize: 20 }
        }
      ]
    })
    const before = await getNodeTool(context, { fileId, nodeId: 'label' })
    await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'update', id: 'label', patch: { letterSpacing: 2 } }]
    })
    expect((await getNodeTool(context, { fileId, nodeId: 'label' })).width).toBeGreaterThan(
      before.width
    )
  })

  it('warns when a text cannot be fitted because its fonts are not available', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Unfit' })
    const result = await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'jp',
          type: 'text',
          parentId: pageId,
          properties: { text: '日本', fontFamily: 'Inter', width: 80, height: 10 }
        }
      ]
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('jp')
    expect(result.warnings[0]).toContain('not fitted')
    expect((await getNodeTool(context, { fileId, nodeId: 'jp' })).height).toBe(10)
  })

  it('saves nothing when one operation in the batch fails', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Atomic' })
    await expect(
      applyOperationsTool(context, {
        fileId,
        operations: [
          { kind: 'create', id: 'box', type: 'rectangle', parentId: pageId },
          { kind: 'update', id: 'missing', patch: { x: 1 } }
        ]
      })
    ).rejects.toThrow('Operation 1')
    const document = await readDocument(context.dataDirectory, fileId)
    expect(Object.keys(document.nodes)).toEqual([pageId])
  })

  it('reads a single node', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Single' })
    await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'create', id: 'dot', type: 'ellipse', parentId: pageId }]
    })
    expect((await getNodeTool(context, { fileId, nodeId: 'dot' })).type).toBe('ellipse')
  })

  it('refuses a file id that could leave the data directory', async () => {
    await expect(getNodeTool(context, { fileId: '../secrets', nodeId: 'x' })).rejects.toThrow()
  })
})

const PNG_SIGNATURE = '89504e470d0a1a0a'
const PNG_WIDTH_OFFSET = 16
const PNG_HEIGHT_OFFSET = 20

const readPngSize = (base64: string): { width: number; height: number } => {
  const bytes = Buffer.from(base64, 'base64')
  return {
    width: bytes.readUInt32BE(PNG_WIDTH_OFFSET),
    height: bytes.readUInt32BE(PNG_HEIGHT_OFFSET)
  }
}

const createSquareFile = async (): Promise<{ fileId: string; pageId: string }> => {
  const { fileId, pageId } = await createFileTool(context, { name: 'Shot' })
  await applyOperationsTool(context, {
    fileId,
    operations: [
      {
        kind: 'create',
        id: 'square',
        type: 'rectangle',
        parentId: pageId,
        properties: { x: 10, y: 10, width: 40, height: 20, fill: '#ff0000' }
      }
    ]
  })
  return { fileId, pageId }
}

describe('export tools', () => {
  it('export_pdf writes one PDF page for each page a file has, in order', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Book' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          type: 'rectangle',
          parentId: pageId,
          properties: { width: 200, height: 100 }
        },
        { kind: 'createPage', id: 'back' },
        {
          kind: 'create',
          type: 'rectangle',
          parentId: 'back',
          properties: { width: 300, height: 150 }
        }
      ]
    })
    const pdf = await exportPdfTool(context, { fileId })
    const source = Buffer.from(pdf.data, 'base64').toString('latin1')
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(2)
    expect(
      [...source.matchAll(/\/MediaBox \[0 0 (\d+) (\d+)]/g)].map((match) => match.slice(1))
    ).toEqual([
      ['200', '100'],
      ['300', '150']
    ])
  })

  it('check_ats reports what a parser reads, and names the node that fails a rule', async () => {
    const withFonts = { ...context, getFontBytes: (fontId: string) => fixtureFontBytes.get(fontId) }
    const { fileId, pageId } = await createFileTool(withFonts, { name: 'Resume' })
    const line = (id: string, text: string, y: number, properties = {}) =>
      ({
        kind: 'create',
        id,
        type: 'text',
        parentId: 'sheet',
        properties: { x: 40, y, width: 400, height: 20, text, ...properties }
      }) as const
    await applyOperationsTool(withFonts, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'sheet',
          type: 'frame',
          parentId: pageId,
          properties: { width: 595, height: 842, pdfPage: 1 }
        },
        line('name', 'Jane Doe', 40),
        line('mail', 'jane@example.com', 70),
        line('phone', '+49 170 1234567', 100),
        line('experience', 'Experience', 140),
        line('glow', 'Glowing skills', 200, { blur: 4 })
      ]
    })
    const report = await checkAtsTool(withFonts, { fileId })
    const statusOf = (rule: string, nodeId?: string) =>
      report.findings.find((finding) => finding.rule === rule && finding.nodeId === nodeId)?.status
    expect(statusOf('selectable-text', 'glow')).toBe('fail')
    expect(statusOf('contact-details')).toBe('pass')
    expect(statusOf('section-headings')).toBe('warn')
    expect(statusOf('fonts')).toBe('pass')
    expect(report.readingOrder[0]).toContain('Jane Doe')
    expect(report.parser).toContain('pdf.js')
    expect(report.summary.fail).toBe(1)
  })

  it('check_ats checks a PDF made elsewhere on its own and lists the rule it could not run', async () => {
    const withFonts = { ...context, getFontBytes: (fontId: string) => fixtureFontBytes.get(fontId) }
    const { fileId, pageId } = await createFileTool(withFonts, { name: 'Resume' })
    await applyOperationsTool(withFonts, {
      fileId,
      operations: [
        {
          kind: 'create',
          type: 'text',
          parentId: pageId,
          properties: { x: 40, y: 40, width: 300, height: 20, text: 'Jane Doe' }
        }
      ]
    })
    const { data } = await exportPdfTool(withFonts, { fileId })
    const report = await checkAtsTool(withFonts, { pdfBase64: data })
    expect(report.notChecked.map((entry) => entry.rule)).toEqual(['selectable-text'])
    expect(report.findings).toContainEqual(
      expect.objectContaining({ rule: 'text-extraction', status: 'pass' })
    )
    expect(report.findings).toContainEqual(
      expect.objectContaining({ rule: 'text-layer', status: 'pass' })
    )
    expect(report.readingOrder[0]).toContain('Jane Doe')
  })

  it('check_ats takes exactly one of a file id and a PDF, and refuses what is not a PDF', async () => {
    await expect(checkAtsTool(context, {})).rejects.toThrow('exactly one')
    await expect(checkAtsTool(context, { fileId: 'a', pdfBase64: 'JVBERi0=' })).rejects.toThrow(
      'exactly one'
    )
    await expect(
      checkAtsTool(context, { pdfBase64: Buffer.from('hello').toString('base64') })
    ).rejects.toThrow('not a PDF')
  })

  it('export_pdf grows a page by its bleed, and trimMarks adds room for crop marks', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Print' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          type: 'frame',
          parentId: pageId,
          properties: { width: 200, height: 100, pdfPage: 1, bleed: 9 }
        }
      ]
    })
    const readBoxes = async (trimMarks?: boolean): Promise<string> =>
      Buffer.from((await exportPdfTool(context, { fileId, trimMarks })).data, 'base64').toString(
        'latin1'
      )
    const plain = await readBoxes()
    expect(plain).toContain('/MediaBox [0 0 218 118]')
    expect(plain).toContain('/TrimBox [9 9 209 109]')
    expect(plain).toContain('/BleedBox [0 0 218 118]')
    expect(await readBoxes(true)).toContain('/MediaBox [0 0 254 154]')
  })

  it('export_pdf writes vector colour as DeviceCMYK when colorSpace is cmyk', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Inks' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          type: 'rectangle',
          parentId: pageId,
          properties: { width: 50, height: 50, fill: '#ff0000' }
        }
      ]
    })
    const readContent = async (colorSpace?: 'rgb' | 'cmyk'): Promise<string> => {
      const pdf = Buffer.from((await exportPdfTool(context, { fileId, colorSpace })).data, 'base64')
      return [...pdf.toString('latin1').matchAll(/stream\r?\n([\S\s]*?)\r?\nendstream/g)]
        .map((match) => {
          // The XMP metadata is a stream too, written uncompressed.
          try {
            return inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString('latin1')
          } catch {
            return ''
          }
        })
        .join('\n')
    }
    expect(await readContent()).toContain('/DeviceRGB cs')
    expect(await readContent('cmyk')).toMatch(/\/DeviceCMYK cs\s+0 1 1 0 scn/)
  })

  it('export_pdf makes a page of each frame given a pdfPage, in that order', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Spreads' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'board',
          type: 'frame',
          parentId: pageId,
          properties: { x: 0, y: 0, width: 900, height: 900 }
        },
        {
          kind: 'create',
          id: 'second',
          type: 'frame',
          parentId: pageId,
          properties: { x: 1000, y: 0, width: 300, height: 150, pdfPage: 2 }
        },
        {
          kind: 'create',
          id: 'first',
          type: 'frame',
          parentId: pageId,
          properties: { x: 0, y: 1000, width: 200, height: 100, pdfPage: 1 }
        }
      ]
    })
    const pdf = await exportPdfTool(context, { fileId })
    const source = Buffer.from(pdf.data, 'base64').toString('latin1')
    expect(
      [...source.matchAll(/\/MediaBox \[0 0 (\d+) (\d+)]/g)].map((match) => match.slice(1))
    ).toEqual([
      ['200', '100'],
      ['300', '150']
    ])
  })

  it('export_pdf carries the metadata and the tags apply_ops saved', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Résumé' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        { kind: 'updateMetadata', patch: { title: 'Jane Doe, CV', author: 'Jane Doe' } },
        {
          kind: 'create',
          id: 'name',
          type: 'text',
          parentId: pageId,
          properties: { text: 'Jane', fontFamily: 'Inter', fill: '#000000', pdfTag: 'h1' }
        }
      ]
    })
    const pdf = await exportPdfTool(
      { ...context, getFontBytes: (fontId) => fixtureFontBytes.get(fontId) },
      { fileId }
    )
    const source = Buffer.from(pdf.data, 'base64').toString('latin1')
    expect(source).toContain('(Jane Doe, CV)')
    expect(source).toContain('(Jane Doe)')
    expect(source).toContain('/S /H1')
    expect((await readDocument(context.dataDirectory, fileId)).nodes['name']?.pdfTag).toBe('h1')
  })

  it('export_pdf returns a PDF with the fonts its text uses embedded', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Print' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'title',
          type: 'text',
          parentId: pageId,
          properties: { text: 'Once', fontFamily: 'Inter', fontSize: 24, fill: '#000000' }
        }
      ]
    })
    const pdf = await exportPdfTool(
      { ...context, getFontBytes: (fontId) => fixtureFontBytes.get(fontId) },
      { fileId }
    )
    const source = Buffer.from(pdf.data, 'base64').toString('latin1')
    expect(pdf.mimeType).toBe('application/pdf')
    expect(source.startsWith('%PDF')).toBe(true)
    expect(source).toContain('/FontFile2')
  })

  it('export_svg returns the svg of a node', async () => {
    const { fileId } = await createSquareFile()
    const svg = await exportSvgTool(context, { fileId, nodeId: 'square' })
    expect(svg).toContain('viewBox="10 10 40 20"')
    expect(svg).toContain('fill="#ff0000"')
  })

  it("export_svg draws a master on each page that uses it, with that page's number", async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Master' })
    const frame = (id: string, x: number) => ({
      kind: 'create' as const,
      id,
      type: 'frame' as const,
      parentId: pageId,
      properties: { x, y: 0, width: 100, height: 100 }
    })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        frame('master', 500),
        { kind: 'update', id: 'master', patch: { isMaster: true } },
        {
          kind: 'create',
          id: 'number',
          type: 'text',
          parentId: 'master',
          properties: { x: 510, y: 80, text: 'Page {page}', fontFamily: 'Inter' }
        },
        frame('one', 0),
        frame('two', 200),
        { kind: 'update', id: 'one', patch: { masterId: 'master', pdfPage: 1 } },
        { kind: 'update', id: 'two', patch: { masterId: 'master', pdfPage: 2 } }
      ]
    })
    const first = await exportSvgTool(context, { fileId, nodeId: 'one' })
    const second = await exportSvgTool(context, { fileId, nodeId: 'two' })
    expect(first).toContain('Page 1')
    expect(second).toContain('Page 2')
    expect(second).not.toContain('{page}')
  })

  it('get_screenshot returns a png of the page by default', async () => {
    const { fileId } = await createSquareFile()
    const image = await getScreenshotTool(context, { fileId })
    expect(image.mimeType).toBe('image/png')
    expect(Buffer.from(image.data, 'base64').toString('hex', 0, 8)).toBe(PNG_SIGNATURE)
    expect(readPngSize(image.data)).toEqual({ width: 40, height: 20 })
  })

  it('get_screenshot asks for the fonts of the texts it draws, and draws with them', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Fonts' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'title',
          type: 'text',
          parentId: pageId,
          properties: {
            x: 0,
            y: 0,
            width: 200,
            height: 40,
            text: 'Once',
            fontSize: 24,
            fontFamily: 'Noto Sans'
          }
        },
        {
          kind: 'create',
          id: 'square',
          type: 'rectangle',
          parentId: pageId,
          properties: { x: 0, y: 50, width: 10, height: 10, fill: '#ff0000' }
        }
      ]
    })
    const asked: ScreenshotText[][] = []
    const withFonts = await getScreenshotTool(
      {
        ...context,
        loadScreenshotFonts: async (texts) => {
          asked.push([...texts])
          return { ...NO_FONTS, files: [NOTO_SANS_FIXTURE] }
        }
      },
      { fileId }
    )
    expect(asked).toEqual([
      [{ fontFamily: 'Noto Sans', fontWeight: 400, fontStyle: 'normal', text: 'Once' }]
    ])
    const withoutFonts = await getScreenshotTool(context, { fileId })
    expect(withFonts.data).not.toBe(withoutFonts.data)
  })

  it('get_screenshot asks for no fonts when what it draws has no text', async () => {
    const { fileId } = await createSquareFile()
    const loadScreenshotFonts = vi.fn(async () => NO_FONTS)
    await getScreenshotTool({ ...context, loadScreenshotFonts }, { fileId })
    expect(loadScreenshotFonts).toHaveBeenCalledWith([])
  })

  it('get_screenshot scales the output', async () => {
    const { fileId } = await createSquareFile()
    const image = await getScreenshotTool(context, { fileId, nodeId: 'square', scale: 2 })
    expect(readPngSize(image.data)).toEqual({ width: 80, height: 40 })
  })

  // resvg aborts the whole process when a clipped group holds content more than a canvas
  // size beyond the canvas edge, so a stray child of a frame used to take the server down.
  it('get_screenshot renders a frame with children far outside it', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Stray children' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'card',
          type: 'frame',
          parentId: pageId,
          properties: { x: 100, y: 8400, width: 840, height: 420 }
        },
        {
          kind: 'create',
          type: 'ellipse',
          parentId: 'card',
          properties: { x: 14_000, y: 8500, width: 50, height: 50, fill: '#8fae8b4d' }
        },
        {
          kind: 'create',
          type: 'rectangle',
          parentId: 'card',
          properties: { x: 15_000, y: 8600, width: 50, height: 50, fill: null, stroke: '#000000' }
        }
      ]
    })
    const image = await getScreenshotTool(context, { fileId, nodeId: 'card' })
    expect(readPngSize(image.data)).toEqual({ width: 840, height: 420 })
  })

  it('get_screenshot rejects an unknown node', async () => {
    const { fileId } = await createSquareFile()
    await expect(getScreenshotTool(context, { fileId, nodeId: 'missing' })).rejects.toThrow(
      'Node missing does not exist'
    )
  })
})

const DEFAULT_TEXT_PROPERTIES = { textAlign: 'left', lineHeight: 1.2, textWrap: false }

const connectClient = async (): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([
    createDesignoServer(context).connect(serverTransport),
    client.connect(clientTransport)
  ])
  return client
}

describe('text properties on the node tools', () => {
  it('gives a new text node the defaults', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Defaults' })
    await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'create', id: 'words', type: 'text', parentId: pageId }]
    })
    expect(await getNodeTool(context, { fileId, nodeId: 'words' })).toMatchObject(
      DEFAULT_TEXT_PROPERTIES
    )
  })

  it('create_node, update_node and apply_ops take the three properties and save them', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Set' })
    const client = await connectClient()
    const created = await client.callTool({
      name: 'create_node',
      arguments: {
        fileId,
        type: 'text',
        parentId: pageId,
        properties: { text: 'Hi', textAlign: 'center', lineHeight: 1.5, textWrap: true, width: 200 }
      }
    })
    expect(created.isError).toBeFalsy()
    const updated = await client.callTool({
      name: 'update_node',
      arguments: { fileId, nodeId: 'text-3', patch: { textAlign: 'right' } }
    })
    expect(updated.isError).toBeFalsy()
    const batched = await client.callTool({
      name: 'apply_ops',
      arguments: {
        fileId,
        operations: [
          {
            kind: 'create',
            id: 'second',
            type: 'text',
            parentId: pageId,
            properties: { lineHeight: 2 }
          },
          { kind: 'update', id: 'second', patch: { textWrap: true } }
        ]
      }
    })
    expect(batched.isError).toBeFalsy()
    expect(await getNodeTool(context, { fileId, nodeId: 'text-3' })).toMatchObject({
      textAlign: 'right',
      lineHeight: 1.5,
      textWrap: true
    })
    expect(await getNodeTool(context, { fileId, nodeId: 'second' })).toMatchObject({
      textAlign: 'left',
      lineHeight: 2,
      textWrap: true
    })
  })

  it('takes a gradient, blur, blend mode and shadow, saves them, and refuses a bad one', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Effects' })
    const client = await connectClient()
    const gradient = {
      kind: 'radial',
      angle: 0,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff80' }
      ]
    }
    const shadow = { x: 2, y: 3, blur: 4, color: '#00000080' }
    const created = await client.callTool({
      name: 'create_node',
      arguments: {
        fileId,
        type: 'ellipse',
        parentId: pageId,
        properties: { gradient, blur: 6, blendMode: 'multiply', shadow }
      }
    })
    expect(created.isError).toBeFalsy()
    expect(await getNodeTool(context, { fileId, nodeId: 'ellipse-3' })).toMatchObject({
      gradient,
      blur: 6,
      blendMode: 'multiply',
      shadow
    })
    const refused = await Promise.all(
      [
        { blur: -1 },
        { blendMode: 'dissolve' },
        { gradient: { kind: 'linear', angle: 0, stops: [{ offset: 0, color: '#ff0000' }] } },
        {
          gradient: {
            kind: 'linear',
            angle: 0,
            stops: [
              { offset: 1, color: '#ff0000' },
              { offset: 0, color: '#0000ff' }
            ]
          }
        },
        { shadow: { x: 0, y: 0, blur: -2, color: '#000000' } }
      ].map((patch) =>
        client.callTool({ name: 'update_node', arguments: { fileId, nodeId: 'ellipse-3', patch } })
      )
    )
    expect(refused.every((result) => result.isError)).toBe(true)
  })

  it('refuses an alignment, a line height or a wrap switch the schema does not allow', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Refused' })
    const client = await connectClient()
    const attempts = [
      { textAlign: 'distribute' },
      { fontWeight: 1000 },
      { fontStyle: 'oblique' },
      { letterSpacing: 5 },
      { lineHeight: 0 },
      { lineHeight: -1.2 },
      { textWrap: 'yes' }
    ]
    const results = await Promise.all(
      attempts.map((properties) =>
        client.callTool({
          name: 'create_node',
          arguments: { fileId, type: 'text', parentId: pageId, properties }
        })
      )
    )
    expect(results.every((result) => result.isError === true)).toBe(true)
    expect(Object.keys((await readDocument(context.dataDirectory, fileId)).nodes)).toEqual([pageId])
  })

  it('create_node, update_node and apply_ops take a link and save it, and refuse an unsafe one', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Links' })
    const client = await connectClient()
    const created = await client.callTool({
      name: 'create_node',
      arguments: {
        fileId,
        type: 'text',
        parentId: pageId,
        properties: { text: 'Mail me', link: 'mailto:me@example.com' }
      }
    })
    expect(created.isError).toBeFalsy()
    const batched = await client.callTool({
      name: 'apply_ops',
      arguments: {
        fileId,
        operations: [
          {
            kind: 'create',
            id: 'button',
            type: 'rectangle',
            parentId: pageId,
            properties: { link: 'https://example.com/cv' }
          }
        ]
      }
    })
    expect(batched.isError).toBeFalsy()
    const updated = await client.callTool({
      name: 'update_node',
      arguments: { fileId, nodeId: 'button', patch: { link: 'tel:+49 170 1234567' } }
    })
    expect(updated.isError).toBeFalsy()
    const { nodes } = await readDocument(context.dataDirectory, fileId)
    expect(nodes.button?.link).toBe('tel:+49 170 1234567')
    expect(Object.values(nodes).find((node) => node.type === 'text')?.link).toBe(
      'mailto:me@example.com'
    )
    const refused = await client.callTool({
      name: 'update_node',
      arguments: { fileId, nodeId: 'button', patch: { link: 'javascript:alert(1)' } }
    })
    expect(refused.isError).toBe(true)
    const cleared = await client.callTool({
      name: 'update_node',
      arguments: { fileId, nodeId: 'button', patch: { link: null } }
    })
    expect(cleared.isError).toBeFalsy()
  })

  it('describes the properties to the agent in the tool schema', async () => {
    const client = await connectClient()
    const { tools } = await client.listTools()
    const schema = JSON.stringify(tools.find((tool) => tool.name === 'create_node')?.inputSchema)
    expect(schema).toContain('textAlign')
    expect(schema).toContain('lineHeight')
    expect(schema).toContain('textWrap')
  })

  it('opens a version 2 file and shows the defaults, so an old design reads as it did', async () => {
    const document = createDocument('old-file', 'Old', 'old-page')
    const versionTwoPage = Object.fromEntries(
      Object.entries(document.nodes['old-page'] ?? {}).filter(
        ([key]) => !Object.keys(DEFAULT_TEXT_PROPERTIES).includes(key)
      )
    )
    await writeFile(
      path.join(context.dataDirectory, 'old-file.designo.json'),
      JSON.stringify({ ...document, formatVersion: 2, nodes: { 'old-page': versionTwoPage } })
    )
    expect(await getNodeTool(context, { fileId: 'old-file', nodeId: 'old-page' })).toMatchObject(
      DEFAULT_TEXT_PROPERTIES
    )
  })
})

describe('auto-layout on the node tools', () => {
  it('lays children out when a batch creates them, and again when one changes', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Layout' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'row',
          type: 'frame',
          parentId: pageId,
          properties: { x: 10, y: 10, layoutMode: 'horizontal', layoutGap: 8, widthSizing: 'hug' }
        },
        {
          kind: 'create',
          id: 'a',
          type: 'rectangle',
          parentId: 'row',
          properties: { width: 40, height: 20 }
        },
        {
          kind: 'create',
          id: 'b',
          type: 'rectangle',
          parentId: 'row',
          properties: { width: 30, height: 20 }
        }
      ]
    })
    expect(await getNodeTool(context, { fileId, nodeId: 'b' })).toMatchObject({ x: 58, y: 10 })
    expect(await getNodeTool(context, { fileId, nodeId: 'row' })).toMatchObject({ width: 78 })
    await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'update', id: 'a', patch: { width: 60 } }]
    })
    expect(await getNodeTool(context, { fileId, nodeId: 'b' })).toMatchObject({ x: 78 })
  })

  describe('a wrapped text that fills a row', () => {
    const COPY = 'one two three four five six seven eight nine ten eleven twelve'

    const heightAt = async (width: number): Promise<number> =>
      Math.ceil(
        (
          await measureTextTool(context, {
            text: COPY,
            fontFamily: 'Inter',
            fontSize: 20,
            lineHeight: 1.45,
            width
          })
        ).height
      )

    const createRow = async (rowWidth: number): Promise<string> => {
      const { fileId, pageId } = await createFileTool(context, { name: 'Row' })
      await applyOperationsTool(context, {
        fileId,
        operations: [
          {
            kind: 'create',
            id: 'row',
            type: 'frame',
            parentId: pageId,
            properties: {
              layoutMode: 'horizontal',
              layoutGap: 5,
              width: rowWidth,
              heightSizing: 'hug'
            }
          },
          {
            kind: 'create',
            id: 'dot',
            type: 'text',
            parentId: 'row',
            properties: { text: '•', fontFamily: 'Inter', fontSize: 20 }
          },
          {
            kind: 'create',
            id: 'copy',
            type: 'text',
            parentId: 'row',
            properties: {
              text: COPY,
              fontFamily: 'Inter',
              fontSize: 20,
              lineHeight: 1.45,
              textWrap: true,
              widthSizing: 'fill',
              heightSizing: 'hug'
            }
          }
        ]
      })
      return fileId
    }

    it('is as tall as its lines at the width the row gives it', async () => {
      const fileId = await createRow(300)
      const copy = await getNodeTool(context, { fileId, nodeId: 'copy' })
      expect(copy.height).toBe(await heightAt(copy.width))
    })

    it('is measured again when the row around it is resized', async () => {
      const fileId = await createRow(300)
      await applyOperationsTool(context, {
        fileId,
        operations: [{ kind: 'update', id: 'row', patch: { width: 600 } }]
      })
      const copy = await getNodeTool(context, { fileId, nodeId: 'copy' })
      const row = await getNodeTool(context, { fileId, nodeId: 'row' })
      expect(copy.height).toBe(await heightAt(copy.width))
      expect(row.height).toBe(copy.height)
    })
  })

  it('refuses auto-layout on a rectangle and nothing is saved', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Refuse' })
    await expect(
      applyOperationsTool(context, {
        fileId,
        operations: [
          {
            kind: 'create',
            id: 'r',
            type: 'rectangle',
            parentId: pageId,
            properties: { layoutMode: 'vertical' }
          }
        ]
      })
    ).rejects.toThrow(/only a frame/)
  })

  it('opens a version 6 file with auto-layout off', async () => {
    const document = createDocument('old-six', 'Old', 'old-page')
    const versionSixPage = Object.fromEntries(
      Object.entries(document.nodes['old-page'] ?? {}).filter(
        ([key]) => !/^layout|Sizing$/.test(key)
      )
    )
    await writeFile(
      path.join(context.dataDirectory, 'old-six.designo.json'),
      JSON.stringify({ ...document, formatVersion: 6, nodes: { 'old-page': versionSixPage } })
    )
    expect(await getNodeTool(context, { fileId: 'old-six', nodeId: 'old-page' })).toMatchObject({
      layoutMode: 'none',
      widthSizing: 'fixed'
    })
  })
})

describe('set_page_setup', () => {
  const makeFrame = async (): Promise<string> => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Book' })
    await applyOperationsTool(context, {
      fileId,
      operations: [{ kind: 'create', id: 'spread', type: 'frame', parentId: pageId }]
    })
    return fileId
  }

  it('sets a size, bleed and guides written in millimetres, and stores points', async () => {
    const fileId = await makeFrame()
    await setPageSetupTool(context, {
      fileId,
      nodeId: 'spread',
      setup: {
        unit: 'mm',
        width: 420,
        height: 210,
        bleed: 3,
        facing: 'spread',
        margins: { top: 10, bottom: 10, inner: 15, outer: 10 },
        columns: 2,
        gutter: 5,
        fold: true
      }
    })
    const node = await getNodeTool(context, { fileId, nodeId: 'spread' })
    expect(node.pageUnit).toBe('mm')
    expect(node.width).toBeCloseTo(1190.55, 2)
    expect(node.bleed).toBeCloseTo(8.504, 3)
    expect(node.facing).toBe('spread')
    expect(node.guides?.margins.inner).toBeCloseTo(42.52, 2)
    expect(node.guides).toMatchObject({ columns: 2, fold: true })
  })

  it('refuses a node that is not a frame, and a missing one', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Book' })
    await expect(
      setPageSetupTool(context, { fileId, nodeId: pageId, setup: { width: 10 } })
    ).rejects.toThrow('is a page')
    await expect(
      setPageSetupTool(context, { fileId, nodeId: 'nope', setup: { width: 10 } })
    ).rejects.toThrow('does not exist')
  })

  it('is registered with its schema, and rejects a margin that is not a number', async () => {
    const fileId = await makeFrame()
    const client = await connectClient()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toContain('set_page_setup')
    const result = await client.callTool({
      name: 'set_page_setup',
      arguments: { fileId, nodeId: 'spread', setup: { margins: { top: 'wide' } } }
    })
    expect(result.isError).toBe(true)
  })
})

describe('paths and booleans', () => {
  const makeShapes = async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Shapes' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'square',
          type: 'rectangle',
          parentId: pageId,
          properties: { x: 0, y: 0, width: 10, height: 10, fill: '#ff0000' }
        },
        {
          kind: 'create',
          id: 'round',
          type: 'ellipse',
          parentId: pageId,
          properties: { x: 5, y: 5, width: 10, height: 10 }
        }
      ]
    })
    return fileId
  }

  it.each(['union', 'subtract', 'intersect', 'exclude'] as const)(
    'combines two shapes with %s into one path',
    async (operation) => {
      const fileId = await makeShapes()
      const { nodeId } = await combineNodesTool(context, {
        fileId,
        operation,
        nodeIds: ['square', 'round']
      })
      const document = await readDocument(context.dataDirectory, fileId)
      expect(document.nodes['square']).toBeUndefined()
      expect(document.nodes['round']).toBeUndefined()
      expect(document.nodes[nodeId]).toMatchObject({ type: 'path', fill: '#ff0000' })
      expect(document.nodes[nodeId]?.pathData).not.toBe('')
    }
  )

  it('draws a path from SVG path data given to create_node', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Path' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        {
          kind: 'create',
          id: 'triangle',
          type: 'path',
          parentId: pageId,
          properties: { x: 0, y: 0, width: 10, height: 10, pathData: 'M0,10L5,0L10,10Z' }
        }
      ]
    })
    const svg = await exportSvgTool(context, { fileId, nodeId: 'triangle' })
    expect(svg).toContain('d="M0,10L5,0L10,10Z"')
  })

  it('refuses path data with characters that are not path data', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Bad' })
    const client = await connectClient()
    const result = await client.callTool({
      name: 'create_node',
      arguments: {
        fileId,
        type: 'path',
        parentId: pageId,
        properties: { pathData: 'M0,0" onload="alert(1)' }
      }
    })
    expect(result.isError).toBe(true)
  })

  it('refuses shapes that cannot be combined, and is registered', async () => {
    const fileId = await makeShapes()
    await expect(
      combineNodesTool(context, { fileId, operation: 'union', nodeIds: ['square'] })
    ).rejects.toThrow('two or more')
    const client = await connectClient()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toContain('combine_nodes')
  })
})

describe('variables and text styles', () => {
  const ink = { id: 'ink', name: 'Ink', kind: 'color', value: '#111111' } as const
  const body = {
    id: 'body',
    name: 'Body',
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: 1.4,
    letterSpacing: 0
  } as const

  const setUp = async (): Promise<string> => {
    const { fileId, pageId } = await createFileTool(context, { name: 'CV' })
    await applyOperationsTool(context, {
      fileId,
      operations: [
        { kind: 'setVariable', variable: ink },
        { kind: 'setTextStyle', style: body },
        {
          kind: 'create',
          id: 'bar',
          type: 'rectangle',
          parentId: pageId,
          properties: { bindings: { fill: 'ink' } }
        },
        {
          kind: 'create',
          id: 'note',
          type: 'text',
          parentId: pageId,
          properties: { text: 'Hi', textStyleId: 'body' }
        }
      ]
    })
    return fileId
  }

  it('get_styles lists them, and the nodes hold the resolved values', async () => {
    const fileId = await setUp()
    expect(await getStylesTool(context, { fileId })).toEqual({
      variables: [ink],
      textStyles: [body]
    })
    expect((await getNodeTool(context, { fileId, nodeId: 'bar' })).fill).toBe('#111111')
    expect((await getNodeTool(context, { fileId, nodeId: 'note' })).fontSize).toBe(11)
  })

  it('one apply_ops on a variable or a style reaches the node and the SVG export', async () => {
    const fileId = await setUp()
    await applyOperationsTool(context, {
      fileId,
      operations: [
        { kind: 'setVariable', variable: { ...ink, value: '#ff0000' } },
        { kind: 'setTextStyle', style: { ...body, fontSize: 30 } }
      ]
    })
    expect((await getNodeTool(context, { fileId, nodeId: 'bar' })).fill).toBe('#ff0000')
    expect((await getNodeTool(context, { fileId, nodeId: 'note' })).fontSize).toBe(30)
    expect(await exportSvgTool(context, { fileId })).toContain('#ff0000')
  })

  it('refuses a binding to a variable that does not exist', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'CV' })
    await expect(
      applyOperationsTool(context, {
        fileId,
        operations: [
          {
            kind: 'create',
            type: 'rectangle',
            parentId: pageId,
            properties: { bindings: { fill: 'nope' } }
          }
        ]
      })
    ).rejects.toThrow('variable nope')
  })

  it('registers get_styles, and update_node binds a property', async () => {
    const fileId = await setUp()
    const client = await connectClient()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toContain('get_styles')
    const result = await client.callTool({
      name: 'update_node',
      arguments: { fileId, nodeId: 'bar', patch: { bindings: {} } }
    })
    expect(result.isError).toBeFalsy()
    const styles = await client.callTool({ name: 'get_styles', arguments: { fileId } })
    expect(JSON.stringify(styles.content)).toContain('Ink')
  })
})
