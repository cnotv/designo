import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
  createFileTool,
  exportPdfTool,
  exportSvgTool,
  getDocumentTreeTool,
  getNodeTool,
  getScreenshotTool,
  listFilesTool,
  measureTextTool
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
