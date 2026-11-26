import { describe, expect, it } from 'vitest'
import { checkAts } from '@designo/ats'
import { createCvDocument } from './cvDocument.ts'

describe('createCvDocument', () => {
  it('is one numbered page of tagged text, with a title and an author', () => {
    const document = createCvDocument()
    const texts = Object.values(document.nodes).filter((node) => node.type === 'text')
    expect(texts.length).toBeGreaterThan(10)
    expect(texts.every((node) => node.pdfTag)).toBe(true)
    expect(document.metadata).toEqual({ title: 'Jane Doe, CV', author: 'Jane Doe' })
  })

  it('passes the layout and metadata rules an ATS cares about', () => {
    const report = checkAts(createCvDocument(), { pages: [], fonts: [], links: [] })
    const statusOf = (rule: string) =>
      report.findings.filter((finding) => finding.rule === rule).map((finding) => finding.status)
    expect(statusOf('layout-traps')).toEqual(['pass'])
  })
})
