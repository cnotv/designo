import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDocument } from '@designo/core'
import { applyOperationsToFile, readDocument, writeDocument } from '@designo/storage'
import { readFile } from 'node:fs/promises'
import { renameFontFamily } from '@designo/fonts'
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
      (request.url ?? '').slice(FILES_ROUTE.length),
      applyOperationsToFile
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

  it('deletes a file, and answers 404 for one that is gone', async () => {
    expect((await fetch(`${baseUrl}/file-1`, { method: 'DELETE' })).status).toBe(200)
    expect(await (await fetch(baseUrl)).json()).toEqual([])
    expect((await fetch(`${baseUrl}/file-1`, { method: 'DELETE' })).status).toBe(404)
    expect((await fetch(baseUrl, { method: 'DELETE' })).status).toBe(405)
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

  describe('creating a file', () => {
    const postNewFile = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })

    it('creates an empty file with one page and lists it', async () => {
      const response = await postNewFile({ name: 'Untitled' })
      expect(response.status).toBe(201)
      const { fileId, pageId } = await response.json()
      expect(fileId).toMatch(/^file-/)
      const created = await readDocument(dataDirectory, fileId)
      expect(created.name).toBe('Untitled')
      expect(Object.keys(created.nodes)).toEqual([pageId])
      expect(
        (await (await fetch(baseUrl)).json()).map((file: { id: string }) => file.id)
      ).toContain(fileId)
    })

    it('refuses a blank name', async () => {
      expect((await postNewFile({ name: '   ' })).status).toBe(400)
    })

    it('refuses a request from another site', async () => {
      const response = await postNewFile({ name: 'Untitled' }, { Origin: 'https://evil.example' })
      expect(response.status).toBe(403)
      expect(await (await fetch(baseUrl)).json()).toHaveLength(1)
    })
  })

  it('reports an unknown file', async () => {
    const response = await fetch(`${baseUrl}/nope/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: [{ kind: 'delete', id: 'x' }] })
    })
    expect(response.status).toBe(404)
  })

  describe('pictures', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7])
    const upload = (body: BodyInit, headers: Record<string, string> = {}) =>
      fetch(`${baseUrl}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', ...headers },
        body
      })

    it('stores an uploaded picture and serves it back', async () => {
      const { assetId } = await (await upload(png)).json()
      const served = await fetch(`${baseUrl}/assets/${assetId}`)
      expect(served.headers.get('content-type')).toBe('image/png')
      expect(served.headers.get('x-content-type-options')).toBe('nosniff')
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
    })

    it('refuses bytes that are not a picture, whatever the content type says', async () => {
      expect((await upload('<svg onload="alert(1)">')).status).toBe(400)
    })

    it('refuses an upload that is not sent as an image', async () => {
      expect((await upload(png, { 'Content-Type': 'text/plain' })).status).toBe(415)
    })

    it('refuses an upload from another site', async () => {
      expect((await upload(png, { Origin: 'https://evil.example' })).status).toBe(403)
    })

    it('reports an unknown picture and a malformed id', async () => {
      expect((await fetch(`${baseUrl}/assets/${'a'.repeat(64)}.png`)).status).toBe(404)
      expect((await fetch(`${baseUrl}/assets/..%2Fsecret.png`)).status).toBe(404)
    })
  })
})

describe('fonts', () => {
  const uploadFont = async (body: BodyInit, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/fonts`, {
      method: 'POST',
      headers: { 'Content-Type': 'font/ttf', ...headers },
      body
    })
  // A copy, as fetch takes only bytes backed by a plain ArrayBuffer.
  const studioSans = async (): Promise<Uint8Array<ArrayBuffer>> =>
    new Uint8Array(
      renameFontFamily(
        new Uint8Array(
          await readFile(
            new URL('../../text/src/fixtures/Inter-Regular.subset.ttf', import.meta.url)
          )
        ),
        'Studio Sans'
      )
    )

  it('stores an uploaded font, lists it and serves its file', async () => {
    const bytes = await studioSans()
    const stored = await (await uploadFont(bytes)).json()
    expect(stored).toMatchObject({ family: 'Studio Sans', fontWeight: 400, fontStyle: 'normal' })
    expect(await (await fetch(`${baseUrl}/fonts`)).json()).toEqual([stored])
    const served = await fetch(`${baseUrl}/fonts/${stored.id}`)
    expect(served.headers.get('content-type')).toBe('font/ttf')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes)
  })

  it('refuses a file that is not a font, one sent as a form, and one from another site', async () => {
    expect((await uploadFont('<svg onload="alert(1)">')).status).toBe(400)
    expect((await uploadFont(await studioSans(), { 'Content-Type': 'text/plain' })).status).toBe(
      415
    )
    expect((await uploadFont(await studioSans(), { Origin: 'https://evil.example' })).status).toBe(
      403
    )
    expect(await (await fetch(`${baseUrl}/fonts`)).json()).toEqual([])
  })

  it('reports an unknown font and a malformed id', async () => {
    expect((await fetch(`${baseUrl}/fonts/${'a'.repeat(64)}.ttf`)).status).toBe(404)
    expect((await fetch(`${baseUrl}/fonts/..%2Fstore.json`)).status).toBe(404)
  })
})
