import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { readFontDescription } from './fontDescription.ts'
import { renameFontFamily } from './sfnt.ts'

const readFixture = async (name: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(new URL(`../../text/src/fixtures/${name}`, import.meta.url)))

const INTER = await readFixture('Inter-Regular.subset.ttf')
const ARABIC = await readFixture('NotoSansArabic-Regular.subset.ttf')

describe('readFontDescription', () => {
  it('reads the family, weight and style a font declares', () => {
    expect(readFontDescription(INTER)).toEqual({
      family: 'Inter',
      fontWeight: 400,
      fontStyle: 'normal'
    })
    expect(readFontDescription(ARABIC).family).toBe('Noto Sans Arabic')
  })

  it('reads the family from the Windows name records a renamed file carries', () => {
    expect(readFontDescription(renameFontFamily(INTER, 'Studio Sans')).family).toBe('Studio Sans')
  })

  it('refuses a file that is not a font', () => {
    expect(() => readFontDescription(new TextEncoder().encode('<svg></svg>'))).toThrow()
    expect(() => readFontDescription(new Uint8Array(2))).toThrow('damaged')
  })
})
