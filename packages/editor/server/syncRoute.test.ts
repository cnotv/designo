import { mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFakeIdentityProvider } from '@designo/auth/testing'
import { createDocument } from '@designo/core'
import { writeDocument } from '@designo/storage'
import { readLiveDocument } from '@designo/sync'
import { createSyncHub, type SyncHub } from '@designo/sync/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { createProductionServer } from './createProductionServer.ts'

let dataDirectory: string
let syncHub: SyncHub
let servers: Server[] = []
let providers: WebsocketProvider[] = []

const listen = async (server: Server): Promise<number> => {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

const waitFor = async (condition: () => boolean, deadline = Date.now() + 3000): Promise<void> => {
  if (condition()) return
  if (Date.now() > deadline) throw new Error('Timed out waiting')
  await new Promise((resolve) => setTimeout(resolve, 10))
  await waitFor(condition, deadline)
}

// The status the server answers an upgrade with, or 101 when it opens.
const upgradeStatus = (url: string, headers: Record<string, string> = {}): Promise<number> =>
  new Promise((resolve) => {
    const socket = new WebSocket(url, { headers })
    socket.on('open', () => {
      socket.close()
      resolve(101)
    })
    socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
    socket.on('error', () => undefined)
  })

const staticStub = (_request: unknown, response: { end: (body: string) => void }): void => {
  response.end('static editor')
}

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-sync-route-'))
  syncHub = createSyncHub()
  await writeDocument(dataDirectory, createDocument('file-1', 'One', 'page'))
})

afterEach(async () => {
  providers.forEach((provider) => provider.destroy())
  providers = []
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
  servers = []
  // The server closes its hub without waiting, so the rooms' last writes are awaited here.
  await syncHub.close()
  await rm(dataDirectory, { recursive: true, force: true })
})

describe('the live connection route', () => {
  it('sends an edit posted to the files API to the people who have the file open', async () => {
    const port = await listen(
      createProductionServer({ dataDirectory, serveStatic: staticStub, syncHub })
    )
    const yDocument = new Y.Doc()
    const provider = new WebsocketProvider(`ws://127.0.0.1:${port}/api/sync`, 'file-1', yDocument, {
      WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket
    })
    providers.push(provider)
    await waitFor(() => provider.synced)
    const response = await fetch(`http://127.0.0.1:${port}/api/files/file-1/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: [{ kind: 'create', id: 'box', type: 'rectangle', parentId: 'page' }]
      })
    })
    expect(response.status).toBe(200)
    await waitFor(() => readLiveDocument(yDocument)?.nodes.box !== undefined)
  })

  it('refuses another site, an unknown file and a bad id', async () => {
    const port = await listen(
      createProductionServer({ dataDirectory, serveStatic: staticStub, syncHub })
    )
    const base = `ws://127.0.0.1:${port}/api/sync`
    expect(await upgradeStatus(`${base}/file-1`, { Origin: 'https://evil.example' })).toBe(403)
    expect(await upgradeStatus(`${base}/missing`)).toBe(404)
    expect(await upgradeStatus(`${base}/..%2Fsecrets`)).toBe(400)
    expect(await upgradeStatus(`${base}/file-1`)).toBe(101)
  })

  it('refuses a connection that is not signed in when sign-in is on', async () => {
    const port = await listen(
      createProductionServer({
        dataDirectory,
        serveStatic: staticStub,
        syncHub,
        settings: {
          googleClientId: 'client-id.example.com',
          googleClientSecret: 'google-client-secret-that-must-never-leak',
          publicUrl: 'http://localhost:5320',
          secureCookies: false,
          sessionSecret: 'a-session-secret-that-is-long-enough-1234',
          adminEmails: [],
          autoApproveEmails: [],
          autoApproveDomains: []
        },
        identityProvider: createFakeIdentityProvider({})
      })
    )
    expect(await upgradeStatus(`ws://127.0.0.1:${port}/api/sync/file-1`)).toBe(401)
  })
})
