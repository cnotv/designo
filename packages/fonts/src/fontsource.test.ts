import { readFile } from 'node:fs/promises'
import type { FontVariant } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { createFontsourceResolver, toFontsourceId } from './fontsource.ts'
import type { FontFetch } from './types.ts'

const GELASIO = JSON.parse(
  await readFile(new URL('./fixtures/gelasio.fontsource.json', import.meta.url), 'utf8')
) as unknown

const REGULAR: FontVariant = { fontWeight: 400, fontStyle: 'normal' }

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
    const family = await createFontsourceResolver({ fetch: fetchGelasio })('Gelasio', REGULAR)
    expect(family?.family).toBe('Gelasio')
    expect(family?.files.map((file) => file.id)).toEqual([
      'gelasio:400normal:latin',
      'gelasio:400normal:vietnamese',
      'gelasio:400normal:latin-ext'
    ])
    expect(family?.files[0]?.url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+latin-400-normal\.ttf$/)
    expect(family?.files[0]?.coverage).toContain('U+0000-00FF')
  })

  it('uses the nearest weight and the style asked for', async () => {
    const family = await createFontsourceResolver({ fetch: fetchGelasio })('Gelasio', {
      fontWeight: 650,
      fontStyle: 'italic'
    })
    expect(family?.files[0]?.url).toMatch(/latin-700-italic\.ttf$/)
    expect(family?.files[0]?.id).toBe('gelasio:700italic:latin')
    expect(family?.files[0]).toMatchObject({ fontWeight: 700, fontStyle: 'italic' })
  })

  it('answers undefined for a family the API does not have', async () => {
    expect(
      await createFontsourceResolver({ fetch: fetchGelasio })('Georgia', REGULAR)
    ).toBeUndefined()
  })

  it('fails on any other error, and on data that is not a family', async () => {
    await expect(
      createFontsourceResolver({ fetch: () => Promise.resolve(answer(503)) })('Gelasio', REGULAR)
    ).rejects.toThrow('The font API answered 503 for Gelasio')
    await expect(
      createFontsourceResolver({ fetch: () => Promise.resolve(answer(200, { id: 'x' })) })(
        'X',
        REGULAR
      )
    ).rejects.toThrow()
  })
})
