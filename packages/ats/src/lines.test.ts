import { describe, expect, it } from 'vitest'
import { getPageLines } from './lines.ts'
import type { PdfPageFacts } from './types.ts'

const item = (text: string, x: number, y: number, width = 40) => ({
  text,
  x,
  y,
  width,
  height: 10
})
const page = (...items: ReturnType<typeof item>[]): PdfPageFacts => ({
  width: 600,
  height: 800,
  items
})

describe('getPageLines', () => {
  it('joins strings on one row into one cell when the gap is a word space', () => {
    const [line] = getPageLines(page(item('Jane', 50, 50), item('Doe', 95, 50)))
    expect(line?.cells).toEqual(['Jane Doe'])
  })

  it('starts a new cell at a gap as wide as a column gutter', () => {
    const [line] = getPageLines(page(item('Skills', 50, 50), item('Experience', 350, 50)))
    expect(line?.cells).toEqual(['Skills', 'Experience'])
  })

  it('orders rows from the top and ignores blank strings', () => {
    const lines = getPageLines(
      page(item('second', 50, 90), item(' ', 50, 70), item('first', 50, 20))
    )
    expect(lines.map((line) => line.text)).toEqual(['first', 'second'])
  })
})
