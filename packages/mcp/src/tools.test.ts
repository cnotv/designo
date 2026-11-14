import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readDocument } from '@designo/storage'
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

  it('get_screenshot scales the output', async () => {
    const { fileId } = await createSquareFile()
    const image = await getScreenshotTool(context, { fileId, nodeId: 'square', scale: 2 })
    expect(readPngSize(image.data)).toEqual({ width: 80, height: 40 })
  })

  it('get_screenshot rejects an unknown node', async () => {
    const { fileId } = await createSquareFile()
    await expect(getScreenshotTool(context, { fileId, nodeId: 'missing' })).rejects.toThrow(
      'Node missing does not exist'
    )
  })
})
