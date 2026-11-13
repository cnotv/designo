import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDocument } from '@designo/core'
import { readDocument, writeDocument } from '@designo/storage'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FILES_ROUTE, handleFilesRequest } from './filesApi.ts'

let dataDirectory: string
let server: Server
let baseUrl: string

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-api-'))
  await writeDocument(dataDirectory, createDocument('file-1', 'One', 'page'))
  server = createServer((request, response) => {
    void handleFilesRequest(
      dataDirectory,
      request,
      response,
      (request.url ?? '').slice(FILES_ROUTE.length)
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${FILES_ROUTE}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(dataDirectory, { recursive: true, force: true })
})

const postOperations = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${baseUrl}/file-1/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })

describe('files API', () => {
  it('lists files and reads one', async () => {
    expect(await (await fetch(baseUrl)).json()).toEqual([
      { id: 'file-1', name: 'One', nodeCount: 1 }
    ])
    expect((await (await fetch(`${baseUrl}/file-1`)).json()).rootId).toBe('page')
  })

  it('applies posted operations and returns the saved document', async () => {
    const response = await postOperations({
      operations: [
        { kind: 'create', id: 'box', type: 'rectangle', parentId: 'page', properties: { x: 5 } }
      ]
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.createdNodeIds).toEqual(['box'])
    expect((await readDocument(dataDirectory, 'file-1')).nodes.box?.x).toBe(5)
  })

  it('makes ids for creates that come without one', async () => {
    const response = await postOperations({
      operations: [{ kind: 'create', type: 'ellipse', parentId: 'page' }]
    })
    expect((await response.json()).createdNodeIds[0]).toMatch(/^ellipse-/)
  })

  it('refuses anything but JSON, which would skip the CORS preflight', async () => {
    const response = await fetch(`${baseUrl}/file-1/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ operations: [{ kind: 'delete', id: 'x' }] })
    })
    expect(response.status).toBe(415)
  })

  it('refuses a request from another site', async () => {
    const response = await postOperations(
      { operations: [{ kind: 'create', type: 'ellipse', parentId: 'page' }] },
      { Origin: 'https://evil.example' }
    )
    expect(response.status).toBe(403)
    expect(Object.keys((await readDocument(dataDirectory, 'file-1')).nodes)).toEqual(['page'])
  })

  it('refuses operations that fail validation', async () => {
    const response = await postOperations({
      operations: [{ kind: 'update', id: 'page', patch: { fill: 'red' } }]
    })
    expect(response.status).toBe(400)
  })

  it('reports a batch that cannot apply, and saves nothing', async () => {
    const response = await postOperations({ operations: [{ kind: 'delete', id: 'missing' }] })
    expect(response.status).toBe(409)
  })

  it('reports an unknown file', async () => {
    const response = await fetch(`${baseUrl}/nope/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [{ kind: 'delete', id: 'x' }] })
    })
    expect(response.status).toBe(404)
  })
})
