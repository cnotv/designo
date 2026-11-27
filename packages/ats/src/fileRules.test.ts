import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument, type DesignDocument } from '@designo/core'
import { checkFonts, checkLinks, checkMetadata } from './fileRules.ts'
import { getPlacedNodes } from './scope.ts'
import type { PdfFacts } from './types.ts'

const facts = (patch: Partial<PdfFacts> = {}): PdfFacts => ({
  pages: [],
  fonts: [],
  links: [],
  ...patch
})

const withLink = (): DesignDocument => {
  const result = applyOperations(createDocument('f', 'Resume', 'page'), [
    {
      kind: 'create',
      id: 'mail',
      type: 'text',
      parentId: 'page',
      properties: {
        x: 10,
        y: 10,
        width: 100,
        height: 20,
        text: 'jane@example.com',
        link: 'mailto:jane@example.com'
      }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

describe('checkFonts', () => {
  it('fails a font that is not embedded or has no Unicode map', () => {
    const findings = checkFonts(
      facts({ fonts: [{ name: 'Helvetica', embedded: false, hasUnicodeMap: false }] })
    )
    expect(findings).toEqual([
      expect.objectContaining({
        status: 'fail',
        message: 'Helvetica: not embedded, no Unicode map.'
      })
    ])
  })

  it('passes embedded fonts with a map', () => {
    expect(
      checkFonts(facts({ fonts: [{ name: 'Inter', embedded: true, hasUnicodeMap: true }] }))[0]
    ).toMatchObject({ status: 'pass' })
  })
})

describe('checkMetadata', () => {
  it('warns about a title, an author and a language that are not set', () => {
    const findings = checkMetadata(createDocument('f', 'Resume', 'page'), facts())
    expect(findings.map((finding) => finding.status)).toEqual(['warn', 'warn', 'warn'])
  })

  it('passes when all three are set', () => {
    const document = { ...createDocument('f', 'Resume', 'page'), metadata: { title: 'CV' } }
    expect(checkMetadata(document, facts({ author: 'Jane', language: 'en' }))).toEqual([
      expect.objectContaining({ status: 'pass' })
    ])
  })
})

describe('checkLinks', () => {
  const placed = getPlacedNodes(withLink())

  it('fails a link that is not an annotation in the PDF', () => {
    expect(checkLinks(placed, facts())[0]).toMatchObject({ status: 'fail', nodeId: 'mail' })
  })

  it('warns about a link with no visible text', () => {
    const links = [{ page: 1, url: 'mailto:jane@example.com', visibleText: '' }]
    expect(checkLinks(placed, facts({ links }))[0]).toMatchObject({ status: 'warn' })
  })

  it('passes a link with its text drawn', () => {
    const links = [{ page: 1, url: 'mailto:jane@example.com', visibleText: 'jane@example.com' }]
    expect(checkLinks(placed, facts({ links }))[0]).toMatchObject({ status: 'pass' })
  })
})
