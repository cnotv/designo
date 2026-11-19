import type { TextFace } from '@designo/core'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScreenshotFontLoader } from './screenshotFonts.ts'

// The editor's test fonts stand in for the font API's files: Inter for Latin and Cyrillic, which
// its range below also claims for Arabic, and Noto Sans Arabic, which has the Arabic glyphs.
const readFixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`../../text/src/fixtures/${name}`, import.meta.url)))

const FILES: Record<string, Uint8Array> = {
  'https://fonts.test/inter.ttf': await readFixture('Inter-Regular.subset.ttf'),
  'https://fonts.test/arabic.ttf': await readFixture('NotoSansArabic-Regular.subset.ttf')
}

const family = (id: string, name: string, url: string, range: string) => ({
  id,
  family: name,
  subsets: ['all'],
  weights: [400],
  styles: ['normal'],
  unicodeRange: { all: range },
  variants: { '400': { normal: { all: { url: { ttf: url } } } } }
})

const API: Record<string, unknown> = {
  inter: family('inter', 'Inter', 'https://fonts.test/inter.ttf', 'U+0000-04FF,U+0600-06FF'),
  'noto-sans-arabic': family(
    'noto-sans-arabic',
    'Noto Sans Arabic',
    'https://fonts.test/arabic.ttf',
    'U+0600-06FF'
  )
}

const answer = (status: number, body: unknown = null) => ({
  ok: status === 200,
  status,
  json: () => Promise.resolve(body)
})

let cacheDirectory: string

beforeEach(async () => {
  cacheDirectory = await mkdtemp(path.join(tmpdir(), 'designo-fonts-'))
})

afterEach(async () => {
  await rm(cacheDirectory, { recursive: true, force: true })
})

const setup = () => {
  const fetchJson = vi.fn(async (url: string) => {
    const body = API[url.replace(/.*\//, '')]
    return body ? answer(200, body) : answer(404)
  })
  const fetchBytes = vi.fn(async (url: string) => {
    const bytes = FILES[url]
    if (!bytes) throw new Error(`no file at ${url}`)
    return bytes
  })
  const warn = vi.fn()
  const load = createScreenshotFontLoader({ fetchJson, fetchBytes, cacheDirectory, warn })
  return { load, fetchJson, fetchBytes, warn }
}

const REGULAR = { fontWeight: 400, fontStyle: 'normal' } as const

const regular = (fontFamily: string): TextFace => ({ fontFamily, ...REGULAR })

describe('createScreenshotFontLoader', () => {
  it('downloads the file that really has a glyph, not the first whose range names it', async () => {
    const { load, fetchBytes } = setup()
    const fonts = await load([{ fontFamily: 'Inter', ...REGULAR, text: 'Hi مرحبا' }])
    expect(fetchBytes.mock.calls.map(([url]) => url)).toEqual([
      'https://fonts.test/inter.ttf',
      'https://fonts.test/arabic.ttf'
    ])
    expect(fonts.files).toHaveLength(2)
  })

  it('draws a text with the renamed file that has most of its characters, on the first family baseline', async () => {
    const { load } = setup()
    const fonts = await load([
      { fontFamily: 'Inter', ...REGULAR, text: 'Hi there' },
      { fontFamily: 'Noto Sans Arabic', ...REGULAR, text: 'مرحبا بالعالم' }
    ])
    const inter = fonts.resolveFontFamily(regular('Inter'))
    const arabic = fonts.resolveFontFamily(regular('Noto Sans Arabic'))
    expect(inter).toMatch(/^designo-[\da-f]{16}$/)
    expect(arabic).toMatch(/^designo-[\da-f]{16}$/)
    expect(arabic).not.toBe(inter)
    expect(fonts.getFontMetrics(regular('Inter'))).toEqual({
      unitsPerEm: 2048,
      ascender: 1984,
      descender: -494
    })
  })

  it('reads the API answers and the files from the cache the second time', async () => {
    const { load, fetchJson, fetchBytes } = setup()
    const texts = [{ fontFamily: 'Inter', ...REGULAR, text: 'Once' }]
    const first = await load(texts)
    const askedBefore = fetchJson.mock.calls.length
    const second = await load(texts)
    expect(second.files).toEqual(first.files)
    expect(fetchJson).toHaveBeenCalledTimes(askedBefore)
    expect(fetchBytes).toHaveBeenCalledTimes(1)
    expect((await readdir(cacheDirectory)).some((name) => name.endsWith('.part'))).toBe(false)
  })

  it('draws a list it found nothing for with the page fonts, and says why', async () => {
    const warn = vi.fn()
    const { fetchBytes } = setup()
    const load = createScreenshotFontLoader({
      fetchJson: async (url) =>
        url.endsWith('/inter') ? answer(200, API.inter) : Promise.reject(new Error('offline')),
      fetchBytes,
      cacheDirectory,
      warn
    })
    const fonts = await load([
      { fontFamily: 'Inter', ...REGULAR, text: 'Hi' },
      { fontFamily: 'Lora', ...REGULAR, text: 'Once' }
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline'))
    expect(fonts.resolveFontFamily(regular('Lora'))).toBe(fonts.resolveFontFamily(regular('Inter')))
  })

  it('has no files and plain runs when nothing could be found at all', async () => {
    const load = createScreenshotFontLoader({
      fetchJson: () => Promise.reject(new Error('offline')),
      fetchBytes: vi.fn(),
      cacheDirectory,
      warn: vi.fn()
    })
    const fonts = await load([{ fontFamily: 'Lora', ...REGULAR, text: 'Once' }])
    expect(fonts.files).toEqual([])
    expect(fonts.resolveFontFamily(regular('Lora'))).toBeUndefined()
    expect(fonts.getFontMetrics(regular('Lora'))).toBeUndefined()
  })
})
