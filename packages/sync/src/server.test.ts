import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { applyOperations, createDocument } from '@designo/core'
import { readDocument, writeDocument } from '@designo/storage'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { applyOperationsToLiveDocument, readLiveDocument } from './liveDocument.ts'
import { publishPresence } from './presence.ts'
import { readPresenceFile } from './presenceFile.ts'
import { createSyncHub, SYNC_ROUTE } from './server.ts'
import type { SyncHub } from './serverTypes.ts'

const FAST = { pollMilliseconds: 20, saveDelayMilliseconds: 5, presenceDelayMilliseconds: 5 }

const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  deadline = Date.now() + 3000
): Promise<void> => {
  if (await condition()) return
  if (Date.now() > deadline) throw new Error('Timed out waiting')
  await new Promise((resolve) => setTimeout(resolve, 10))
  await waitFor(condition, deadline)
}

let dataDirectory: string
let hub: SyncHub
let server: Server
let providers: WebsocketProvider[] = []

const connect = async (): Promise<{ provider: WebsocketProvider; yDocument: Y.Doc }> => {
  const yDocument = new Y.Doc()
  const { port } = server.address() as AddressInfo
  const provider = new WebsocketProvider(`ws://127.0.0.1:${port}${SYNC_ROUTE}`, 'doc', yDocument, {
    WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket
  })
  providers.push(provider)
  await waitFor(() => provider.synced)
  return { provider, yDocument }
}

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-sync-'))
  const result = applyOperations(createDocument('doc', 'Doc', 'page'), [
    { kind: 'create', id: 'box', type: 'rectangle', parentId: 'page', properties: { x: 0 } }
  ])
  if (!result.ok) throw new Error(result.error)
  await writeDocument(dataDirectory, result.document)
  hub = createSyncHub({ timings: FAST })
  server = createServer()
  server.on('upgrade', (request, socket, head) => {
    const fileId = (request.url ?? '').slice(SYNC_ROUTE.length + 1)
    hub.handleUpgrade(request, socket, head, { dataDirectory, fileId })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})

afterEach(async () => {
  providers.forEach((provider) => provider.destroy())
  providers = []
  await hub.close()
  await new Promise((resolve) => server.close(resolve))
  await rm(dataDirectory, { recursive: true, force: true })
})

describe('the sync hub', () => {
  it('converges two clients after concurrent edits and saves the merge', async () => {
    const first = await connect()
    const second = await connect()
    applyOperationsToLiveDocument(
      first.yDocument,
      [{ kind: 'update', id: 'box', patch: { x: 40 } }],
      {
        kind: 'operations',
        clientId: first.yDocument.clientID
      }
    )
    applyOperationsToLiveDocument(
      second.yDocument,
      [{ kind: 'update', id: 'box', patch: { fill: '#ff0000' } }],
      { kind: 'operations', clientId: second.yDocument.clientID }
    )
    await waitFor(async () => {
      const saved = await readDocument(dataDirectory, 'doc')
      return saved.nodes.box?.x === 40 && saved.nodes.box.fill === '#ff0000'
    })
    expect(readLiveDocument(first.yDocument)).toEqual(readLiveDocument(second.yDocument))
  })

  it('sends a batch applied through the hub to the open clients', async () => {
    const client = await connect()
    const applied = await hub.applyOperations(
      dataDirectory,
      'doc',
      [{ kind: 'create', type: 'ellipse', parentId: 'page', properties: {} }],
      () => 'oval'
    )
    expect(applied.createdNodeIds).toEqual(['oval'])
    expect((await readDocument(dataDirectory, 'doc')).nodes.oval).toBeDefined()
    await waitFor(() => readLiveDocument(client.yDocument)?.nodes.oval !== undefined)
  })

  it('picks up a write another process makes to the file', async () => {
    const client = await connect()
    const saved = await readDocument(dataDirectory, 'doc')
    const changed = applyOperations(saved, [{ kind: 'update', id: 'box', patch: { y: 99 } }])
    if (!changed.ok) throw new Error(changed.error)
    await writeDocument(dataDirectory, changed.document)
    await waitFor(() => readLiveDocument(client.yDocument)?.nodes.box?.y === 99)
  })

  it('reports presence to get_selection, live and through the presence file', async () => {
    const client = await connect()
    publishPresence(client.provider.awareness, {
      user: { name: 'Ada', color: '#0090ff', kind: 'person' },
      selection: ['box'],
      cursor: { x: 10, y: 20 }
    })
    await waitFor(() => hub.getPresence(dataDirectory, 'doc').length === 1)
    expect(hub.getPresence(dataDirectory, 'doc')[0]).toMatchObject({
      user: { name: 'Ada' },
      selection: ['box']
    })
    await waitFor(
      async () => (await readPresenceFile(dataDirectory, 'doc', Date.now())).length === 1
    )
  })

  it('applies straight to the file when nobody has it open', async () => {
    await hub.applyOperations(dataDirectory, 'doc', [{ kind: 'delete', id: 'box' }], () => 'unused')
    expect((await readDocument(dataDirectory, 'doc')).nodes.box).toBeUndefined()
  })
})
