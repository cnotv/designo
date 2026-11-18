import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createFontsourceResolver, toFontsourceId } from './fontsource.ts'
import type { FontFetch } from './types.ts'

const GELASIO = JSON.parse(
  await readFile(new URL('./fixtures/gelasio.fontsource.json', import.meta.url), 'utf8')
) as unknown

const answer = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body)
})

const fetchGelasio: FontFetch = (url) =>
  Promise.resolve(url.endsWith('/gelasio') ? answer(200, GELASIO) : answer(404))

describe('toFontsourceId', () => {
  it('lowercases a name and joins its words with hyphens', () => {
    expect(toFontsourceId(' Noto Sans Arabic ')).toBe('noto-sans-arabic')
    expect(toFontsourceId('"Playfair Display SC"')).toBe('playfair-display-sc')
  })
})

describe('createFontsourceResolver', () => {
  it('lists one TrueType file per subset, the Latin one first, with its characters', async () => {
    const family = await createFontsourceResolver({ fetch: fetchGelasio })('Gelasio')
    expect(family?.family).toBe('Gelasio')
    expect(family?.files.map((file) => file.id)).toEqual([
      'gelasio:latin',
      'gelasio:vietnamese',
      'gelasio:latin-ext'
    ])
    expect(family?.files[0]?.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+latin-400-normal\.ttf$/)
    expect(family?.files[0]?.coverage).toContain('U+0000-00FF')
  })

  it('uses the nearest weight and the style asked for', async () => {
    const family = await createFontsourceResolver({
      fetch: fetchGelasio,
      weight: 650,
      style: 'italic'
    })('Gelasio')
    expect(family?.files[0]?.url).toMatch(/latin-700-italic\.ttf$/)
  })

  it('answers undefined for a family the API does not have', async () => {
    expect(await createFontsourceResolver({ fetch: fetchGelasio })('Georgia')).toBeUndefined()
  })

  it('fails on any other error, and on data that is not a family', async () => {
    await expect(
      createFontsourceResolver({ fetch: () => Promise.resolve(answer(503)) })('Gelasio')
    ).rejects.toThrow('The font API answered 503 for Gelasio')
    await expect(
      createFontsourceResolver({ fetch: () => Promise.resolve(answer(200, { id: 'x' })) })('X')
    ).rejects.toThrow()
  })
})
