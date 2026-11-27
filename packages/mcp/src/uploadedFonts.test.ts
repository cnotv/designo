import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from '@designo/core'
import { exportDocumentToPdf } from '@designo/exporter/pdf'
import { renameFontFamily } from '@designo/fonts'
import { toTextLayoutRequest } from '@designo/text'
import { createScreenshotFontLoader } from './screenshotFonts.ts'
import { createNodeLayoutText } from './textLayout.ts'
import {
  getAccountFonts,
  listUploadedFonts,
  storeUploadedFont,
  toFileUrlFonts
} from './uploadedFonts.ts'

const INTER = new Uint8Array(
  await readFile(new URL('../../text/src/fixtures/Inter-Regular.subset.ttf', import.meta.url))
)
const STUDIO_SANS = renameFontFamily(INTER, 'Studio Sans')

// The font API knows no family, and no file may be downloaded: only the uploaded font can draw.
const noFontApi = {
  fetchJson: () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) }),
  fetchBytes: (url: string) => Promise.reject(new Error(`No download expected: ${url}`))
}

const textNode = {
  text: 'Studio',
  fontFamily: 'Studio Sans',
  fontWeight: 400,
  fontStyle: 'normal' as const
}

let parent = ''
let account = ''

beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), 'designo-uploaded-'))
  account = path.join(parent, 'account-a')
})

afterEach(async () => {
  await rm(parent, { recursive: true, force: true })
})

describe('uploaded fonts', () => {
  it('stores a font and lists it for that account only', async () => {
    const stored = await storeUploadedFont(account, STUDIO_SANS)
    expect(stored).toMatchObject({ family: 'Studio Sans', fontWeight: 400, fontStyle: 'normal' })
    expect(await listUploadedFonts(account)).toEqual([stored])
    expect(await listUploadedFonts(path.join(parent, 'account-b'))).toEqual([])
  })

  it('refuses a file that is not a font', async () => {
    await expect(
      storeUploadedFont(account, new TextEncoder().encode('<svg onload=x>'))
    ).rejects.toThrow('not a TrueType or OpenType font')
    expect(await listUploadedFonts(account)).toEqual([])
  })

  it('keeps the shared fonts for an account with no upload', async () => {
    expect(await getAccountFonts(account)).toBe(await getAccountFonts(path.join(parent, 'other')))
  })

  it('draws a text in the uploaded font in the layout, the screenshot and the PDF', async () => {
    await storeUploadedFont(account, STUDIO_SANS)
    const uploadedFonts = toFileUrlFonts(account, await listUploadedFonts(account))
    const cacheDirectory = path.join(parent, 'cache')

    const layoutText = createNodeLayoutText({ ...noFontApi, cacheDirectory, uploadedFonts })
    const created = applyOperations(createDocument('file', 'Fonts', 'page'), [
      { kind: 'create', id: 'title', type: 'text', parentId: 'page', properties: textNode }
    ])
    if (!created.ok) throw new Error(created.error)
    const node = created.document.nodes.title
    if (!node) throw new Error('No text node')
    const layout = await layoutText(toTextLayoutRequest(node))
    const fontIds = new Set(layout?.lines.flatMap((line) => line.glyphs.map((g) => g.fontId)))
    expect([...fontIds]).toEqual([`uploaded:${uploadedFonts[0]?.id}`])
    expect(layoutText.getFontBytes([...fontIds][0] ?? '')).toEqual(STUDIO_SANS)

    const pdf = await exportDocumentToPdf(created.document, {
      getTextLayout: () => layout,
      getFontBytes: layoutText.getFontBytes
    })
    expect(Buffer.from(pdf).toString('latin1')).toMatch(/\/BaseFont \/[A-Z]{6}\+StudioSans/)

    const screenshotFonts = await createScreenshotFontLoader({
      ...noFontApi,
      cacheDirectory,
      uploadedFonts,
      warn: (message) => {
        throw new Error(message)
      }
    })([{ ...textNode }])
    expect(screenshotFonts.files).toHaveLength(1)
    expect(screenshotFonts.resolveFontFamily(textNode)).toMatch(/^designo-/)
  })
})
