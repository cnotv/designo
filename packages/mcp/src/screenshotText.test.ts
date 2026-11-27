import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from '@designo/core'
import { renameFontFamily } from '@designo/fonts'
import { writeDocument } from '@designo/storage'
import { toTextLayoutRequest } from '@designo/text'
import { createScreenshotFontLoader } from './screenshotFonts.ts'
import { createNodeLayoutText } from './textLayout.ts'
import { exportSvgTool, getScreenshotTool } from './tools.ts'
import type { DesignoToolContext } from './types.ts'
import { listUploadedFonts, storeUploadedFont, toFileUrlFonts } from './uploadedFonts.ts'

const readFixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`../../text/src/fixtures/${name}`, import.meta.url)))

// Two fonts that each lack the other's script, as a Latin face and its Hebrew fallback do.
const LATIN = renameFontFamily(await readFixture('Inter-Regular.subset.ttf'), 'Studio Sans')
const HEBREW = renameFontFamily(
  await readFixture('NotoSansHebrew-Regular.subset.ttf'),
  'Studio Hebrew'
)
const MIXED_LINE = 'Shalom שלום'
const NOTDEF_GLYPH = 0

// No font API and no download: only the two uploaded fonts can draw.
const noFontApi = {
  fetchJson: () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) }),
  fetchBytes: (url: string) => Promise.reject(new Error(`No download expected: ${url}`))
}

let parent = ''

beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), 'designo-screenshot-text-'))
})

afterEach(async () => {
  await rm(parent, { recursive: true, force: true })
})

const setUpMixedLine = async () => {
  const account = path.join(parent, 'account')
  await storeUploadedFont(account, LATIN)
  await storeUploadedFont(account, HEBREW)
  const uploadedFonts = toFileUrlFonts(account, await listUploadedFonts(account))
  const cacheDirectory = path.join(parent, 'cache')
  const layoutText = createNodeLayoutText({ ...noFontApi, cacheDirectory, uploadedFonts })
  const created = applyOperations(createDocument('mixed', 'Mixed', 'page'), [
    {
      kind: 'create',
      id: 'line',
      type: 'text',
      parentId: 'page',
      properties: { text: MIXED_LINE, fontFamily: 'Studio Sans, Studio Hebrew', fontSize: 24 }
    }
  ])
  if (!created.ok) throw new Error(created.error)
  await writeDocument(account, created.document)
  const renderedSvgs: string[] = []
  const context: DesignoToolContext = {
    dataDirectory: account,
    generateId: (prefix) => `${prefix}-1`,
    layoutText,
    getGlyphOutline: layoutText.getGlyphOutline,
    loadScreenshotFonts: createScreenshotFontLoader({
      ...noFontApi,
      cacheDirectory,
      uploadedFonts
    }),
    rasterize: (svg) => {
      renderedSvgs.push(svg)
      return Promise.resolve({ ok: true, png: Buffer.from([]) })
    }
  }
  return { context, layoutText, document: created.document, renderedSvgs }
}

describe('text in screenshots', () => {
  it('shapes a line that needs two fonts with a real glyph from each', async () => {
    const { layoutText, document } = await setUpMixedLine()
    const node = document.nodes.line
    if (!node) throw new Error('No text node')
    const glyphs = (await layoutText(toTextLayoutRequest(node)))?.lines.flatMap(
      (line) => line.glyphs
    )
    expect(new Set(glyphs?.map((glyph) => glyph.fontId)).size).toBe(2)
    expect(glyphs?.some((glyph) => glyph.glyphId === NOTDEF_GLYPH)).toBe(false)
  })

  it('draws the line as glyph outlines, so the renderer needs neither font', async () => {
    const { context, renderedSvgs } = await setUpMixedLine()
    await getScreenshotTool(context, { fileId: 'mixed' })
    const [svg] = renderedSvgs
    expect(svg).not.toContain('<text')
    expect(svg).toMatch(/<g fill="#[\da-f]{6}"><path d="M[\d\s,.CLMQZ-]+"\/><\/g>/)
  })

  it('keeps SVG export selectable unless text as paths is asked for', async () => {
    const { context } = await setUpMixedLine()
    expect(await exportSvgTool(context, { fileId: 'mixed' })).toContain(`>${MIXED_LINE}</text>`)
    const outlined = await exportSvgTool(context, { fileId: 'mixed', textAsPaths: true })
    expect(outlined).not.toContain('<text')
    expect(outlined).toContain('<path d="M')
  })
})
