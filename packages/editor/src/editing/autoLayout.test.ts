import { DEFAULT_NODE_PROPERTIES, type DesignNode } from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  readLayoutAlign,
  readLayoutMode,
  readLayoutSizing,
  sizingOptionsFor
} from './autoLayout.ts'

const frame = (properties: Partial<DesignNode> = {}): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: 'f',
  type: 'frame',
  parentId: 'p',
  order: 0,
  ...properties
})

const values = (options: { value: string }[]): string[] => options.map((option) => option.value)

describe('readers', () => {
  it('read a known value and ignore the rest, as a deselected toggle sends', () => {
    expect(readLayoutMode('vertical')).toBe('vertical')
    expect(readLayoutMode('')).toBeUndefined()
    expect(readLayoutAlign('space-between')).toBe('space-between')
    expect(readLayoutAlign('stretch')).toBeUndefined()
    expect(readLayoutSizing('fill')).toBe('fill')
    expect(readLayoutSizing(3)).toBeUndefined()
  })
})

describe('sizingOptionsFor', () => {
  it('offers only fixed to a plain node in a plain parent', () => {
    expect(values(sizingOptionsFor(frame(), frame(), 'fixed'))).toEqual(['fixed'])
  })

  it('offers hug on an auto-layout frame and fill inside an auto-layout parent', () => {
    expect(
      values(
        sizingOptionsFor(
          frame({ layoutMode: 'vertical' }),
          frame({ layoutMode: 'horizontal' }),
          'fixed'
        )
      )
    ).toEqual(['fixed', 'hug', 'fill'])
  })

  it('keeps the current value listed even when it no longer applies', () => {
    expect(values(sizingOptionsFor(frame(), undefined, 'fill'))).toEqual(['fixed', 'fill'])
  })
})
