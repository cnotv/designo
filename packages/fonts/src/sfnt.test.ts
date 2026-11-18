import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { readCharacterMap, readLineMetrics, renameFontFamily } from './sfnt.ts'

// The editor's test fonts: Inter has a format 4 map only, Noto Sans Arabic a format 12 one too.
const readFixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`../../text/src/fixtures/${name}`, import.meta.url)))

const INTER = await readFixture('Inter-Regular.subset.ttf')
const ARABIC = await readFixture('NotoSansArabic-Regular.subset.ttf')

describe('readCharacterMap', () => {
  it('says which characters a font has a glyph for', () => {
    const has = readCharacterMap(INTER)
    expect(has('A'.codePointAt(0) ?? 0)).toBe(true)
    expect(has(0x04_14)).toBe(true)
    expect(has(0x06_45)).toBe(false)
  })

  it('reads a script font', () => {
    const has = readCharacterMap(ARABIC)
    expect(has(0x06_45)).toBe(true)
    expect(has('A'.codePointAt(0) ?? 0)).toBe(false)
  })
})

describe('readLineMetrics', () => {
  it('reads the metrics HarfBuzz uses, the typographic ones when the font asks for them', () => {
    expect(readLineMetrics(INTER)).toEqual({ unitsPerEm: 2048, ascender: 1984, descender: -494 })
  })
})

describe('renameFontFamily', () => {
  it('keeps every glyph and metric and changes only the name', () => {
    const renamed = renameFontFamily(INTER, 'designo-test')
    expect(readLineMetrics(renamed)).toEqual(readLineMetrics(INTER))
    expect(readCharacterMap(renamed)(0x04_14)).toBe(true)
    expect(new TextDecoder('utf-16be').decode(renamed)).toContain('designo-test')
    expect(new TextDecoder('utf-16be').decode(INTER)).not.toContain('designo-test')
  })
})
