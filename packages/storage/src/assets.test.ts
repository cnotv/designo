import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assetIdSchema } from './schemas.ts'
import { detectImageType, MAX_ASSET_BYTES, readAsset, writeAsset } from './assets.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1])
const GIF = new TextEncoder().encode('GIF89a rest')
const WEBP = new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')

describe('detectImageType', () => {
  it.each([
    ['png', PNG],
    ['jpg', JPEG],
    ['gif', GIF],
    ['webp', WEBP]
  ] as const)('reads %s from its first bytes', (type, bytes) => {
    expect(detectImageType(bytes)?.extension).toBe(type)
  })

  it('refuses anything else, whatever its name says', () => {
    expect(detectImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeUndefined()
  })
})

describe('assets on disk', () => {
  let directory = ''
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'designo-assets-'))
  })
  afterEach(() => rm(directory, { recursive: true, force: true }))

  it('keeps a picture under the hash of its bytes and reads it back', async () => {
    const id = await writeAsset(directory, PNG)
    expect(assetIdSchema.safeParse(id).success).toBe(true)
    expect(id.endsWith('.png')).toBe(true)
    expect(await readAsset(directory, id)).toEqual({ bytes: PNG, mimeType: 'image/png' })
  })

  it('gives the same picture the same id, so it is stored once', async () => {
    expect(await writeAsset(directory, PNG)).toBe(await writeAsset(directory, PNG))
  })

  it('refuses bytes that are not a picture', async () => {
    await expect(writeAsset(directory, new TextEncoder().encode('hello'))).rejects.toThrow(
      /PNG, JPEG, WebP or GIF/
    )
  })

  it('refuses a picture past the size limit', async () => {
    const huge = new Uint8Array(MAX_ASSET_BYTES + 1)
    huge.set(PNG)
    await expect(writeAsset(directory, huge)).rejects.toThrow(/larger than/)
  })

  it('refuses an id that could leave the folder', async () => {
    await expect(readAsset(directory, '../secret.png')).rejects.toThrow()
  })

  it('reports a missing picture', async () => {
    await expect(readAsset(directory, `${'a'.repeat(64)}.png`)).rejects.toThrow()
  })
})
