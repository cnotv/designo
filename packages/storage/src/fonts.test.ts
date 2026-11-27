import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectFontExtension,
  getFontFilePath,
  listFontFiles,
  MAX_FONT_BYTES,
  readFontFile,
  writeFontFile
} from './fonts.ts'
import { fontIdSchema } from './schemas.ts'

const TRUETYPE = Uint8Array.from([0, 1, 0, 0, 0, 9, 1, 2])
const CFF = new TextEncoder().encode('OTTO rest')

describe('detectFontExtension', () => {
  it('reads TrueType and CFF outlines from the first bytes', () => {
    expect(detectFontExtension(TRUETYPE)).toBe('ttf')
    expect(detectFontExtension(new TextEncoder().encode('true rest'))).toBe('ttf')
    expect(detectFontExtension(CFF)).toBe('otf')
  })

  it('refuses WOFF, collections and anything else', () => {
    expect(detectFontExtension(new TextEncoder().encode('wOFF rest'))).toBeUndefined()
    expect(detectFontExtension(new TextEncoder().encode('ttcf rest'))).toBeUndefined()
    expect(detectFontExtension(new TextEncoder().encode('<svg>'))).toBeUndefined()
  })
})

describe('fonts on disk', () => {
  let directory = ''
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'designo-fonts-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('stores a font once under the hash of its bytes, and reads it back', async () => {
    const fontId = await writeFontFile(directory, TRUETYPE)
    expect(fontIdSchema.safeParse(fontId).success).toBe(true)
    expect(await writeFontFile(directory, TRUETYPE)).toBe(fontId)
    expect(await listFontFiles(directory)).toEqual([fontId])
    expect(await readFontFile(directory, fontId)).toEqual(TRUETYPE)
    expect(getFontFilePath(directory, fontId)).toBe(path.join(directory, 'fonts', fontId))
  })

  it('lists none before anything is uploaded', async () => {
    expect(await listFontFiles(directory)).toEqual([])
  })

  it('refuses a file that is not a font or is too large', async () => {
    await expect(writeFontFile(directory, new TextEncoder().encode('hello'))).rejects.toThrow(
      'not a TrueType or OpenType font'
    )
    const large = new Uint8Array(MAX_FONT_BYTES + 1)
    large.set(TRUETYPE)
    await expect(writeFontFile(directory, large)).rejects.toThrow('larger than 10 MB')
  })

  it('never reads outside the font folder', async () => {
    await expect(readFontFile(directory, '../store.json')).rejects.toThrow()
  })
})
