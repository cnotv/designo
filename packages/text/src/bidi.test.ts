import { describe, expect, it } from 'vitest'
import { getVisualOrder, resolveBidiLevels } from './bidi.ts'

const levelsOf = (text: string, base?: 'ltr' | 'rtl') => resolveBidiLevels(text, base).levels

describe('resolveBidiLevels', () => {
  it('has nothing to resolve in an empty string and reads it left to right', () => {
    expect(resolveBidiLevels('')).toEqual({ baseDirection: 'ltr', levels: [] })
  })

  it('keeps Latin text at level 0', () => {
    expect(resolveBidiLevels('Hello, world 42')).toEqual({
      baseDirection: 'ltr',
      levels: Array.from({ length: 15 }, () => 0)
    })
  })

  it('reads a paragraph that starts with Hebrew or Arabic right to left', () => {
    expect(resolveBidiLevels('שלום')).toEqual({ baseDirection: 'rtl', levels: [1, 1, 1, 1] })
    expect(resolveBidiLevels('مرحبا').baseDirection).toBe('rtl')
  })

  it('takes the direction from the first strong letter, skipping digits and spaces', () => {
    expect(resolveBidiLevels('123 שלום').baseDirection).toBe('rtl')
    expect(resolveBidiLevels('123 abc').baseDirection).toBe('ltr')
  })

  it('puts a right to left word inside left to right text at level 1', () => {
    // Hello_שלום_world: the spaces sit between different directions, so they take the paragraph's.
    expect(levelsOf('Hello שלום world')).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
  })

  it('lifts left to right text inside a right to left paragraph to level 2', () => {
    expect(levelsOf('שלום Hello')).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2])
  })

  it('lets a neutral between two letters of the same direction follow them', () => {
    expect(levelsOf('א, ב')).toEqual([1, 1, 1, 1])
    expect(levelsOf('a, b')).toEqual([0, 0, 0, 0])
  })

  it('puts digits in right to left text at level 2, so they read left to right', () => {
    expect(levelsOf('שלום 123')).toEqual([1, 1, 1, 1, 1, 2, 2, 2])
    expect(levelsOf('مرحبا 123')).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2])
  })

  it('keeps digit groups with their separators together', () => {
    expect(levelsOf('שלום 1,000')).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2])
  })

  it('gives a combining mark the level of the letter it sits on', () => {
    // Shin, shin dot and qamats, then lamed, vav and mem.
    const pointedHebrew = String.fromCodePoint(0x5e9, 0x5c1, 0x5b8, 0x5dc, 0x5d5, 0x5dd)
    expect(levelsOf(pointedHebrew)).toEqual([1, 1, 1, 1, 1, 1])
    expect(levelsOf(`a${String.fromCodePoint(0x301)}`)).toEqual([0, 0])
  })

  it('treats a surrogate pair as one character', () => {
    expect(levelsOf('😀')).toEqual([0, 0])
    expect(levelsOf('שלום 😀')).toEqual([1, 1, 1, 1, 1, 1, 1])
  })

  it('can be told which way the paragraph reads', () => {
    expect(resolveBidiLevels('abc', 'rtl')).toEqual({ baseDirection: 'rtl', levels: [2, 2, 2] })
    expect(levelsOf('שלום', 'ltr')).toEqual([1, 1, 1, 1])
  })
})

describe('getVisualOrder', () => {
  it('leaves left to right items alone', () => {
    expect(getVisualOrder([0, 0, 0])).toEqual([0, 1, 2])
  })

  it('reverses a right to left stretch in the middle of a line', () => {
    expect(getVisualOrder([0, 1, 1, 0])).toEqual([0, 2, 1, 3])
  })

  it('reverses everything in a right to left line and puts numbers back in reading order', () => {
    expect(getVisualOrder([1, 1, 2])).toEqual([2, 1, 0])
    expect(getVisualOrder([1, 2, 2, 1])).toEqual([3, 1, 2, 0])
  })

  it('handles an empty line', () => {
    expect(getVisualOrder([])).toEqual([])
  })
})
