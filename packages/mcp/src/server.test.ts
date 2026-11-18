import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createSvgRasterizer, DEFAULT_RENDER_LIMITS } from './rasterize.ts'
import { createDesignoServer } from './server.ts'
import { applyOperationsTool, createFileTool } from './tools.ts'
import type { DesignoToolContext, Rasterize } from './types.ts'

let context: DesignoToolContext
let fileId: string

const rasterizerThatRuns = (workerName: string, timeoutMilliseconds?: number): Rasterize =>
  createSvgRasterizer({
    workerPath: fileURLToPath(new URL(`./testWorkers/${workerName}.ts`, import.meta.url)),
    limits: { ...DEFAULT_RENDER_LIMITS, ...(timeoutMilliseconds ? { timeoutMilliseconds } : {}) }
  })

const connect = async (rasterize?: Rasterize): Promise<Client> => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createDesignoServer({ ...context, rasterize }).connect(serverSide)
  const client = new Client({ name: 'test-agent', version: '0.0.0' })
  await client.connect(clientSide)
  return client
}

const toolResult = z.object({
  isError: z.boolean().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() }))
})

const screenshotOf = async (client: Client) =>
  toolResult.parse(await client.callTool({ name: 'get_screenshot', arguments: { fileId } }))

beforeEach(async () => {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-mcp-server-'))
  context = { dataDirectory, generateId: (prefix) => `${prefix}-1` }
  const created = await createFileTool(context, { name: 'Shot' })
  fileId = created.fileId
  await applyOperationsTool(context, {
    fileId,
    operations: [
      {
        kind: 'create',
        type: 'rectangle',
        parentId: created.pageId,
        properties: { width: 40, height: 20 }
      }
    ]
  })
})

afterEach(async () => {
  await rm(context.dataDirectory, { recursive: true, force: true })
})

describe('get_screenshot as an MCP tool', () => {
  it('returns an image when the render works', async () => {
    const result = await screenshotOf(await connect())
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.type).toBe('image')
  })

  it('says a render crashed, as a tool error, and answers the next call', async () => {
    const client = await connect(rasterizerThatRuns('crashingWorker'))
    const crashed = await screenshotOf(client)
    expect(crashed.isError).toBe(true)
    expect(crashed.content[0]?.text).toContain('Rendering crashed (SIGABRT)')
    const listed = toolResult.parse(await client.callTool({ name: 'list_files', arguments: {} }))
    expect(listed.isError).toBeUndefined()
    expect((await screenshotOf(await connect())).isError).toBeUndefined()
  })

  it('says a render timed out, as a tool error', async () => {
    const client = await connect(rasterizerThatRuns('hangingWorker', 300))
    const timedOut = await screenshotOf(client)
    expect(timedOut.isError).toBe(true)
    expect(timedOut.content[0]?.text).toContain('Rendering timed out after 0.3 s')
  })
})
