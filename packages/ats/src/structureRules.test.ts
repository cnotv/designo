import { describe, expect, it } from 'vitest'
import { checkContactDetails, checkReadingOrder, checkSectionHeadings } from './structureRules.ts'
import type { PdfFacts, PdfTextItem } from './types.ts'

const item = (text: string, x: number, y: number): PdfTextItem => ({
  text,
  x,
  y,
  width: text.length * 5,
  height: 10
})
const factsOf = (...items: PdfTextItem[]): PdfFacts => ({
  pages: [{ width: 600, height: 800, items }],
  fonts: [],
  links: []
})

describe('checkReadingOrder', () => {
  it('passes a single column', () => {
    const facts = factsOf(item('one', 50, 20), item('two', 50, 40), item('three', 50, 60))
    expect(checkReadingOrder(facts)[0]).toMatchObject({ status: 'pass' })
  })

  it('warns about two columns on a page', () => {
    const facts = factsOf(
      ...[20, 40, 60].flatMap((y) => [item('left', 40, y), item('right', 340, y)])
    )
    expect(checkReadingOrder(facts)[0]).toMatchObject({
      status: 'warn',
      page: 1,
      message: expect.stringContaining('column')
    })
  })

  it('names a run of rows with three cells a table', () => {
    const facts = factsOf(
      ...[20, 40, 60].flatMap((y) => [item('a', 40, y), item('b', 240, y), item('c', 440, y)])
    )
    expect(checkReadingOrder(facts)[0]?.message).toContain('table')
  })
})

describe('checkContactDetails', () => {
  it('passes with a name, an email and a phone number up top', () => {
    const facts = factsOf(
      item('Jane Doe', 50, 20),
      item('jane@example.com', 50, 40),
      item('+49 170 1234567', 50, 60)
    )
    expect(checkContactDetails(facts)[0]).toMatchObject({ status: 'pass' })
  })

  it('warns and lists what is missing', () => {
    const facts = factsOf(item('Jane Doe', 50, 20))
    expect(checkContactDetails(facts)[0]).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('email, phone')
    })
  })
})

describe('checkSectionHeadings', () => {
  it('passes when the usual headings are lines of their own', () => {
    const facts = factsOf(
      item('Work Experience', 50, 20),
      item('Education', 50, 40),
      item('Skills:', 50, 60)
    )
    expect(checkSectionHeadings(facts)[0]).toMatchObject({ status: 'pass' })
  })

  it('warns about the headings it cannot find', () => {
    const facts = factsOf(item('Experience', 50, 20))
    expect(checkSectionHeadings(facts)[0]).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('education, skills')
    })
  })
})
