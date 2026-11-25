import { DEFAULT_NODE_PROPERTIES, MAX_LINE_HEIGHT, MIN_LINE_HEIGHT } from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  FONT_WEIGHT_OPTIONS,
  getFontWeightOptions,
  isItalicAvailable,
  LIST_STYLE_OPTIONS,
  readListStyle,
  readFontWeight,
  readLetterSpacingInput,
  readLineHeightInput,
  readTextAlign,
  readTextWidthMode,
  TEXT_ALIGN_OPTIONS,
  TEXT_WIDTH_MODE_OPTIONS,
  textWidthModeOf
} from './textProperties.ts'

describe('readTextAlign', () => {
  it.each(['left', 'center', 'right', 'justify'])('reads %s', (value) => {
    expect(readTextAlign(value)).toBe(value)
  })

  it.each(['', 'distribute', 'LEFT', undefined, 3])(
    'ignores %s, as a deselected toggle sends',
    (value) => {
      expect(readTextAlign(value)).toBeUndefined()
    }
  )

  it('offers every alignment once, in reading order', () => {
    expect(TEXT_ALIGN_OPTIONS.map((option) => option.value)).toEqual([
      'left',
      'center',
      'right',
      'justify'
    ])
  })
})

describe('readFontWeight', () => {
  it('reads each weight the panel offers, sent as text', () => {
    expect(FONT_WEIGHT_OPTIONS.map((option) => readFontWeight(String(option.value)))).toEqual(
      FONT_WEIGHT_OPTIONS.map((option) => option.value)
    )
  })

  it.each(['', '450', 'bold', undefined])('ignores %s', (value) => {
    expect(readFontWeight(value)).toBeUndefined()
  })
})

describe('readLetterSpacingInput', () => {
  it('turns percent of the font size into a multiple of it', () => {
    expect(readLetterSpacingInput('5')).toBeCloseTo(0.05)
    expect(readLetterSpacingInput('-10')).toBeCloseTo(-0.1)
  })

  it('holds the value to the range a file allows', () => {
    expect(readLetterSpacingInput('900')).toBe(2)
    expect(readLetterSpacingInput('-900')).toBe(-0.5)
  })

  it.each(['', '  ', 'abc'])('ignores %j', (raw) => {
    expect(readLetterSpacingInput(raw)).toBeUndefined()
  })
})

describe('text width mode', () => {
  it('reads a fixed-width node from its wrap switch', () => {
    expect(textWidthModeOf({ ...DEFAULT_NODE_PROPERTIES, textWrap: true })).toBe('fixed')
    expect(textWidthModeOf(DEFAULT_NODE_PROPERTIES)).toBe('auto')
  })

  it('reads the two modes and ignores anything else', () => {
    expect(readTextWidthMode('auto')).toBe('auto')
    expect(readTextWidthMode('fixed')).toBe('fixed')
    expect(readTextWidthMode('')).toBeUndefined()
  })

  it('offers both modes', () => {
    expect(TEXT_WIDTH_MODE_OPTIONS.map((option) => option.value)).toEqual(['auto', 'fixed'])
  })
})

describe('readLineHeightInput', () => {
  it('reads a number', () => {
    expect(readLineHeightInput('1.5')).toBe(1.5)
    expect(readLineHeightInput(' 2 ')).toBe(2)
  })

  it('keeps the number inside what a file may hold', () => {
    expect(readLineHeightInput('0')).toBe(MIN_LINE_HEIGHT)
    expect(readLineHeightInput('-3')).toBe(MIN_LINE_HEIGHT)
    expect(readLineHeightInput('99')).toBe(MAX_LINE_HEIGHT)
  })

  it.each(['', '  ', 'abc', 'Infinity', 'NaN'])('leaves the property alone for %j', (raw) => {
    expect(readLineHeightInput(raw)).toBeUndefined()
  })
})

describe('getFontWeightOptions', () => {
  const values = (available: readonly number[], current: number) =>
    getFontWeightOptions(available, current).map((option) => option.value)

  it('offers every weight when the family does not say which it has', () => {
    expect(values([], 400)).toEqual(FONT_WEIGHT_OPTIONS.map((option) => option.value))
  })

  it('offers only the weights the family has', () => {
    expect(values([400, 700], 400)).toEqual([400, 700])
  })

  it('keeps the weight a node already has, so the select never shows a blank', () => {
    expect(values([400, 700], 300)).toEqual([300, 400, 700])
  })

  it('names the weights as type designers do', () => {
    expect(getFontWeightOptions([700], 700)).toEqual([{ value: 700, label: 'Bold' }])
  })
})

describe('isItalicAvailable', () => {
  it('is true when the family does not say which styles it has', () => {
    expect(isItalicAvailable([], 'normal')).toBe(true)
  })

  it('is false for a family with upright faces only', () => {
    expect(isItalicAvailable(['normal'], 'normal')).toBe(false)
  })

  it('is true for a family with an italic face', () => {
    expect(isItalicAvailable(['normal', 'italic'], 'normal')).toBe(true)
  })

  it('stays true for a text that is italic already, so it can be turned off', () => {
    expect(isItalicAvailable(['normal'], 'italic')).toBe(true)
  })
})

describe('readListStyle', () => {
  it.each(['none', 'bullet', 'number'])('reads %s', (value) => {
    expect(readListStyle(value)).toBe(value)
  })

  it('offers each style the file format has', () => {
    expect(LIST_STYLE_OPTIONS.map((option) => option.value)).toEqual(['none', 'bullet', 'number'])
  })

  it('ignores a deselect and anything else', () => {
    expect(readListStyle('')).toBeUndefined()
    expect(readListStyle('roman')).toBeUndefined()
  })
})
