import { describe, expect, it } from 'vitest'
import { findBreakChunks, splitParagraphs } from './lineBreaking.ts'

const describeChunks = (text: string) =>
  findBreakChunks(text).map((chunk) => [
    text.slice(chunk.start, chunk.contentEnd),
    text.slice(chunk.contentEnd, chunk.end)
  ])

describe('splitParagraphs', () => {
  it('keeps text with no line break as one paragraph', () => {
    expect(splitParagraphs('Hello')).toEqual([{ text: 'Hello', start: 0 }])
  })

  it('splits at hard line breaks and remembers where each paragraph starts', () => {
    expect(splitParagraphs('ab\ncd')).toEqual([
      { text: 'ab', start: 0 },
      { text: 'cd', start: 3 }
    ])
  })

  it('reads CRLF as one break and keeps blank lines', () => {
    expect(splitParagraphs('a\r\n\r\nb')).toEqual([
      { text: 'a', start: 0 },
      { text: '', start: 3 },
      { text: 'b', start: 5 }
    ])
  })

  it('has one empty paragraph for empty text, so an empty text still has a line', () => {
    expect(splitParagraphs('')).toEqual([{ text: '', start: 0 }])
  })

  it('has an empty last paragraph after a trailing newline', () => {
    expect(splitParagraphs('a\n')).toEqual([
      { text: 'a', start: 0 },
      { text: '', start: 2 }
    ])
  })
})

describe('findBreakChunks', () => {
  it('has no chunks for an empty paragraph', () => {
    expect(findBreakChunks('')).toEqual([])
  })

  it('makes a chunk of each word with the spaces after it', () => {
    expect(describeChunks('one  two three')).toEqual([
      ['one', '  '],
      ['two', ' '],
      ['three', '']
    ])
  })

  it('keeps punctuation with the word it touches', () => {
    expect(describeChunks('Hello, world!')).toEqual([
      ['Hello,', ' '],
      ['world!', '']
    ])
  })

  it('keeps contractions and numbers whole', () => {
    expect(describeChunks("don't 3.14 a-b")).toEqual([
      ["don't", ' '],
      ['3.14', ' '],
      ['a-b', '']
    ])
  })

  it('does not break at a no-break space', () => {
    const noBreakSpace = String.fromCodePoint(0xa0)
    expect(describeChunks(`a${noBreakSpace}b c`)).toEqual([
      [`a${noBreakSpace}b`, ' '],
      ['c', '']
    ])
  })

  it('starts with a chunk of nothing but spaces when the line starts with them', () => {
    expect(describeChunks('  a')).toEqual([
      ['', '  '],
      ['a', '']
    ])
  })

  it('covers the paragraph without gaps', () => {
    const text = 'Mixed שלום words  here '
    const chunks = findBreakChunks(text)
    expect(chunks[0]?.start).toBe(0)
    expect(chunks.at(-1)?.end).toBe(text.length)
    expect(chunks.slice(1).every((chunk, index) => chunk.start === chunks[index]?.end)).toBe(true)
  })

  it('breaks between words of a script written without spaces', () => {
    const chunks = findBreakChunks('これは日本語です')
    expect(chunks.length).toBeGreaterThan(1)
  })
})
