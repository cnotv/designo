import { describe, expect, it } from 'vitest'
import { checkPdfAts } from './checkAts.ts'
import {
  checkPdfLayoutTraps,
  checkPdfLinks,
  checkPdfMetadata,
  checkTextLayer
} from './pdfOnlyRules.ts'
import type { PdfFacts, PdfTextItem } from './types.ts'

const item = (text: string, x: number, y: number): PdfTextItem => ({
  text,
  x,
  y,
  width: text.length * 5,
  height: 10
})
const factsOf = (items: PdfTextItem[], patch: Partial<PdfFacts> = {}): PdfFacts => ({
  pages: [{ width: 600, height: 800, items }],
  fonts: [],
  links: [],
  ...patch
})

describe('checkTextLayer', () => {
  it('fails a page with no text, such as a scan', () => {
    expect(checkTextLayer(factsOf([item(' ', 50, 50)]))).toEqual([
      expect.objectContaining({ rule: 'text-layer', status: 'fail', page: 1 })
    ])
  })

  it('passes pages that have text', () => {
    expect(checkTextLayer(factsOf([item('Jane', 50, 50)]))[0]).toMatchObject({ status: 'pass' })
  })
})

describe('checkPdfLayoutTraps', () => {
  it('warns about text in the footer strip and about an icon glyph', () => {
    const findings = checkPdfLayoutTraps(
      factsOf([item('Body', 50, 300), item('Page 1', 50, 780), item('', 50, 400)])
    )
    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('header or footer strip'),
      expect.stringContaining('icons')
    ])
  })

  it('does not take a bullet for an icon', () => {
    expect(
      checkPdfLayoutTraps(factsOf([item('•', 50, 300), item('Body', 60, 300)]))[0]
    ).toMatchObject({ status: 'pass' })
  })
})

describe('checkPdfMetadata', () => {
  it('treats a title that is a file name as missing', () => {
    const findings = checkPdfMetadata(
      factsOf([], { title: 'cv-final.pdf', author: 'Jane', language: 'en' })
    )
    expect(findings).toEqual([
      expect.objectContaining({ status: 'warn', message: expect.stringContaining('title') })
    ])
  })

  it('passes with a real title, author and language', () => {
    const facts = factsOf([], { title: 'Jane Doe, CV', author: 'Jane', language: 'en' })
    expect(checkPdfMetadata(facts)[0]).toMatchObject({ status: 'pass' })
  })
})

describe('checkPdfLinks', () => {
  it('warns about a link with no text drawn on it', () => {
    const links = [{ page: 1, url: 'https://example.com', visibleText: '' }]
    expect(checkPdfLinks(factsOf([], { links }))[0]).toMatchObject({ status: 'warn', page: 1 })
  })
})

describe('checkPdfAts', () => {
  it('lists the rules it could not run, and runs the rest', () => {
    const report = checkPdfAts(factsOf([item('Jane Doe', 50, 50)]))
    expect(report.notChecked.map((entry) => entry.rule)).toEqual([
      'selectable-text',
      'text-extraction',
      'layout-traps'
    ])
    expect(report.findings.some((finding) => finding.rule === 'text-layer')).toBe(true)
    expect(report.findings.some((finding) => finding.rule === 'selectable-text')).toBe(false)
  })

  it('flags two columns on a page of a PDF made elsewhere', () => {
    const rows = [100, 130, 160].flatMap((y) => [item('left', 40, y), item('right', 340, y)])
    const report = checkPdfAts(factsOf(rows))
    expect(report.findings).toContainEqual(
      expect.objectContaining({ rule: 'reading-order', status: 'warn' })
    )
  })
})
