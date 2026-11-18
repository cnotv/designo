import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from '@designo/core'
import { readDocument } from '@designo/storage'
import { createDesignoServer } from './server.ts'
import {
  applyOperationsTool,
  createFileTool,
  exportSvgTool,
  getDocumentTreeTool,
  getNodeTool,
  getScreenshotTool,
  listFilesTool
} from './tools.ts'
import type { DesignoToolContext } from './types.ts'

const createCountingIdGenerator = () => {
  let counter = 0
  return (prefix: string) => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

let context: DesignoToolContext

beforeEach(async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-mcp-'))
  context = { dataDirectory, generateId: createCountingIdGenerator() }
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

  it('get_screenshot draws Georgia text in the bundled serif, not the font a node falls back to', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Fonts' })
    const addLabel = (id: string, fontFamily: string) =>
      applyOperationsTool(context, {
        fileId,
        operations: [
          {
            kind: 'create',
            id,
            type: 'text',
            parentId: pageId,
            properties: {
              x: 0,
              y: 0,
              width: 200,
              height: 40,
              text: 'Once upon',
              fontSize: 24,
              fontFamily
            }
          }
        ]
      })
    await addLabel('georgia', 'Georgia')
    await addLabel('gelasio', 'Gelasio')
    await addLabel('inter', 'Inter')
    const [georgia, gelasio, inter] = await Promise.all(
      ['georgia', 'gelasio', 'inter'].map((nodeId) =>
        getScreenshotTool(context, { fileId, nodeId })
      )
    )
    expect(georgia?.data).toBe(gelasio?.data)
    expect(georgia?.data).not.toBe(inter?.data)
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

  it('refuses an alignment, a line height or a wrap switch the schema does not allow', async () => {
    const { fileId, pageId } = await createFileTool(context, { name: 'Refused' })
    const client = await connectClient()
    const attempts = [
      { textAlign: 'justify' },
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
