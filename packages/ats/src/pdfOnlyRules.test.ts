import { describe, expect, it } from 'vitest'
import { checkPdfAts } from './checkAts.ts'
import {
  checkPdfLayoutTraps,
  checkPdfTextExtraction,
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

describe('scanned pages', () => {
  const scan = { x: 0, y: 0, width: 600, height: 800 }

  it('warns when the text is an invisible layer over a picture of the page', () => {
    const facts = {
      ...factsOf([item('Jane Doe', 50, 50)]),
      pages: [
        {
          width: 600,
          height: 800,
          items: [item('Jane Doe', 50, 50)],
          images: [scan],
          hasInvisibleText: true
        }
      ]
    }
    expect(checkTextLayer(facts)[0]).toMatchObject({ status: 'warn', page: 1 })
  })

  it('does not call a picture behind real text a trap, since the scan rule covers it', () => {
    const facts = {
      ...factsOf([]),
      pages: [{ width: 600, height: 800, items: [item('Jane Doe', 50, 50)], images: [scan] }]
    }
    expect(checkPdfLayoutTraps(facts)[0]).toMatchObject({ status: 'pass' })
  })
})

describe('text over a picture', () => {
  it('warns about text that sits on a photo', () => {
    const facts = {
      ...factsOf([]),
      pages: [
        {
          width: 600,
          height: 800,
          items: [item('Jane Doe', 60, 140)],
          images: [{ x: 40, y: 100, width: 200, height: 100 }]
        }
      ]
    }
    expect(checkPdfLayoutTraps(facts)[0]).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('over a picture')
    })
  })
})

describe('checkPdfTextExtraction', () => {
  it('passes ordinary text', () => {
    const facts = factsOf([item('Jane', 50, 100), item(' ', 70, 100), item('Doe', 75, 100)])
    expect(checkPdfTextExtraction(facts)[0]).toMatchObject({ status: 'pass' })
  })

  it('warns about two words a space apart with no space character between them', () => {
    const facts = factsOf([item('Jane', 50, 100), item('Doe', 85, 100)])
    expect(checkPdfTextExtraction(facts)[0]).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('no space character')
    })
  })

  it('warns about characters with no Unicode value', () => {
    expect(checkPdfTextExtraction(factsOf([item('Jane \uFFFD', 50, 100)]))[0]).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('Unicode')
    })
  })

  it('warns when the file draws text out of reading order, but not for one column break', () => {
    const scrambled = factsOf([300, 100, 400, 50, 350, 150].map((y) => item('line', 50, y)))
    expect(checkPdfTextExtraction(scrambled)[0]).toMatchObject({ status: 'warn' })
    const twoColumns = factsOf([
      ...[100, 130, 160].map((y) => item('left', 40, y)),
      ...[100, 130, 160].map((y) => item('right', 340, y))
    ])
    expect(checkPdfTextExtraction(twoColumns)[0]).toMatchObject({ status: 'pass' })
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
    expect(report.notChecked.map((entry) => entry.rule)).toEqual(['selectable-text'])
    expect(report.findings.some((finding) => finding.rule === 'text-layer')).toBe(true)
    expect(report.findings.some((finding) => finding.rule === 'selectable-text')).toBe(false)
    expect(report.findings.some((finding) => finding.rule === 'text-extraction')).toBe(true)
  })

  it('flags two columns on a page of a PDF made elsewhere', () => {
    const rows = [100, 130, 160].flatMap((y) => [item('left', 40, y), item('right', 340, y)])
    const report = checkPdfAts(factsOf(rows))
    expect(report.findings).toContainEqual(
      expect.objectContaining({ rule: 'reading-order', status: 'warn' })
    )
  })
})
