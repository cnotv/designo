import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readAsset } from '@designo/storage'
import { addImageTool } from './addImage.ts'
import { createDesignoServer } from './server.ts'
import { createFileTool, exportSvgTool, getNodeTool } from './tools.ts'
import type { DesignoToolContext } from './types.ts'

// The header of a 400 by 200 PNG: enough for the store to know it and read its size.
const pngHeader = (): Uint8Array => {
  const data = new Uint8Array(24)
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(data.buffer)
  view.setUint32(16, 400)
  view.setUint32(20, 200)
  return data
}
const PICTURE = Buffer.from(pngHeader()).toString('base64')

let counter = 0
let context: DesignoToolContext

beforeEach(async () => {
  counter = 0
  context = {
    dataDirectory: await mkdtemp(path.join(tmpdir(), 'designo-images-')),
    generateId: (prefix) => `${prefix}-${++counter}`
  }
})

afterEach(() => rm(context.dataDirectory, { recursive: true, force: true }))

const newFile = async () => createFileTool(context, { name: 'Pictures' })

describe('addImageTool', () => {
  it('stores the picture and places it at its own size', async () => {
    const { fileId, pageId } = await newFile()
    const added = await addImageTool(context, { fileId, parentId: pageId, data: PICTURE })
    expect(added).toMatchObject({ width: 400, height: 200, warnings: [] })
    const node = await getNodeTool(context, { fileId, nodeId: added.nodeId })
    expect(node).toMatchObject({
      type: 'image',
      imageAsset: added.assetId,
      width: 400,
      height: 200
    })
    expect((await readAsset(context.dataDirectory, added.assetId)).mimeType).toBe('image/png')
  })

  it('keeps the proportions when only a width is given', async () => {
    const { fileId, pageId } = await newFile()
    const added = await addImageTool(context, {
      fileId,
      parentId: pageId,
      data: PICTURE,
      width: 100,
      x: 5
    })
    expect(added).toMatchObject({ width: 100, height: 50 })
  })

  it('refuses data that is not a picture', async () => {
    const { fileId, pageId } = await newFile()
    await expect(
      addImageTool(context, {
        fileId,
        parentId: pageId,
        data: Buffer.from('<svg onload="alert(1)">').toString('base64')
      })
    ).rejects.toThrow(/PNG, JPEG, WebP or GIF/)
  })
})

describe('export_svg with pictures', () => {
  it('embeds the stored picture as a data URI', async () => {
    const { fileId, pageId } = await newFile()
    await addImageTool(context, { fileId, parentId: pageId, data: PICTURE })
    const svg = await exportSvgTool(context, { fileId })
    expect(svg).toContain('<image ')
    expect(svg).toContain('href="data:image/png;base64,')
  })

  it('draws the fill when the stored file is gone, instead of failing', async () => {
    const { fileId, pageId } = await newFile()
    const added = await addImageTool(context, { fileId, parentId: pageId, data: PICTURE })
    await rm(path.join(context.dataDirectory, 'assets', added.assetId))
    expect(await exportSvgTool(context, { fileId })).not.toContain('<image ')
  })
})

describe('the add_image tool', () => {
  it('is offered to an agent and places a picture', async () => {
    const { fileId, pageId } = await newFile()
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
    await createDesignoServer(context).connect(serverTransport)
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientTransport)
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('add_image')
    const result = await client.callTool({
      name: 'add_image',
      arguments: { fileId, parentId: pageId, data: PICTURE }
    })
    expect(result.isError).toBeUndefined()
  })
})
