import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listDocuments, readDocument, resolveDataDirectory, writeDocument } from './store.ts'

let dataDirectory: string

beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'designo-storage-'))
})

afterEach(async () => {
  await rm(dataDirectory, { recursive: true, force: true })
})

describe('store', () => {
  it('round-trips a document', async () => {
    const document = createDocument('file-a', 'A', 'page-a')
    await writeDocument(dataDirectory, document)
    expect(await readDocument(dataDirectory, 'file-a')).toEqual(document)
  })

  it('writes the current format version', async () => {
    await writeDocument(dataDirectory, createDocument('file-w', 'W', 'page-w'))
    const raw = JSON.parse(await readFile(path.join(dataDirectory, 'file-w.designo.json'), 'utf8'))
    expect(raw.formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })

  it('refuses a file from a newer format with a clear message', async () => {
    const newer = { ...createDocument('file-n', 'N', 'page-n'), formatVersion: 99 }
    await writeFile(path.join(dataDirectory, 'file-n.designo.json'), JSON.stringify(newer))
    await expect(readDocument(dataDirectory, 'file-n')).rejects.toThrow(/only understands up to/)
  })

  it('skips files that fail validation when listing', async () => {
    await writeDocument(dataDirectory, createDocument('file-b', 'B', 'page-b'))
    await writeFile(path.join(dataDirectory, 'broken.designo.json'), '{"nope":true}')
    expect((await listDocuments(dataDirectory)).map((summary) => summary.id)).toEqual(['file-b'])
  })

  it('refuses ids that are not plain file names', async () => {
    await expect(readDocument(dataDirectory, '../escape')).rejects.toThrow()
  })

  it('prefers the environment variable for the data directory', () => {
    expect(resolveDataDirectory({ DESIGNO_DATA_DIR: '/tmp/designo' })).toBe('/tmp/designo')
  })
})
