import { describe, expect, it } from 'vitest'
import {
  findUploadedFamilies,
  quoteFamilyName,
  findFontFamilies,
  findPickedFamily,
  readPickedFamilyName,
  toFontFamilyValue
} from './fontPicker.ts'

const family = (name: string, category = 'serif') => ({
  id: name.toLowerCase().replaceAll(' ', '-'),
  family: name,
  category,
  weights: [400, 700],
  styles: ['normal']
})

const FAMILIES = [
  family('Caveat', 'handwriting'),
  family('Lora'),
  family('Playfair Display'),
  family('Roboto Serif'),
  family('Source Serif 4'),
  family('Zilla Slab')
]

describe('findFontFamilies', () => {
  it('lists the first families for an empty search', () => {
    expect(findFontFamilies(FAMILIES, '  ', 2).map((entry) => entry.family)).toEqual([
      'Caveat',
      'Lora'
    ])
  })

  it('matches whatever the case, and puts families starting with the search first', () => {
    expect(findFontFamilies(FAMILIES, 'SER').map((entry) => entry.family)).toEqual([
      'Roboto Serif',
      'Source Serif 4'
    ])
    expect(
      findFontFamilies([family('Abel'), family('Zebra Lab'), family('Lab Sans')], 'lab').map(
        (entry) => entry.family
      )
    ).toEqual(['Lab Sans', 'Zebra Lab'])
  })

  it('stops at the limit', () => {
    expect(findFontFamilies(FAMILIES, 'o', 2)).toHaveLength(2)
  })

  it('finds nothing for a name no family has', () => {
    expect(findFontFamilies(FAMILIES, 'Comic')).toEqual([])
  })
})

describe('toFontFamilyValue', () => {
  it('names the family and a generic one for its category', () => {
    expect(toFontFamilyValue(family('Lora'))).toBe('Lora, serif')
    expect(toFontFamilyValue(family('Caveat', 'handwriting'))).toBe('Caveat, cursive')
  })

  it('quotes a name CSS needs quoted', () => {
    expect(toFontFamilyValue(family('Playfair Display'))).toBe('Playfair Display, serif')
    expect(toFontFamilyValue(family('42dot Sans', 'sans-serif'))).toBe('"42dot Sans", sans-serif')
  })

  it('writes only the name for a category with no generic', () => {
    expect(toFontFamilyValue(family('Material Icons', 'icons'))).toBe('Material Icons')
  })
})

describe('readPickedFamilyName', () => {
  it('reads the first family of the list, without quotes', () => {
    expect(readPickedFamilyName('"Playfair Display", serif')).toBe('Playfair Display')
    expect(readPickedFamilyName('Inter, system-ui, sans-serif')).toBe('Inter')
    expect(readPickedFamilyName('')).toBe('')
  })
})

describe('findPickedFamily', () => {
  it('finds the family a font list starts with, whatever the case', () => {
    expect(findPickedFamily(FAMILIES, '"playfair display", serif')?.id).toBe('playfair-display')
  })

  it('finds nothing for a family the list does not have', () => {
    expect(findPickedFamily(FAMILIES, 'Georgia, serif')).toBeUndefined()
  })
})

describe('findUploadedFamilies', () => {
  const fonts = [
    { family: 'Studio Sans' },
    { family: 'Studio Sans' },
    { family: 'Brand Serif' },
    { family: 'Old Studio' }
  ]

  it('lists each family once, sorted', () => {
    expect(findUploadedFamilies(fonts, '')).toEqual(['Brand Serif', 'Old Studio', 'Studio Sans'])
  })

  it('puts the families starting with the words first', () => {
    expect(findUploadedFamilies(fonts, 'studio')).toEqual(['Studio Sans', 'Old Studio'])
  })
})

describe('quoteFamilyName', () => {
  it('quotes a name CSS cannot read bare', () => {
    expect(quoteFamilyName('Studio Sans')).toBe('Studio Sans')
    expect(quoteFamilyName('1980 Mono')).toBe('"1980 Mono"')
  })
})
