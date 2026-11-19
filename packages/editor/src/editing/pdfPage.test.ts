import { describe, expect, it } from 'vitest'
import { readPdfPageInput } from './pdfPage.ts'

describe('readPdfPageInput', () => {
  it('reads a page number', () => {
    expect(readPdfPageInput('3')).toBe(3)
  })

  it('rounds to a whole number and never goes below 1', () => {
    expect(readPdfPageInput('2.6')).toBe(3)
    expect(readPdfPageInput('0')).toBe(1)
    expect(readPdfPageInput('-4')).toBe(1)
  })

  it('treats an emptied field as not a page', () => {
    expect(readPdfPageInput('  ')).toBeNull()
  })

  it('ignores what is not a number', () => {
    expect(readPdfPageInput('abc')).toBeUndefined()
  })
})
