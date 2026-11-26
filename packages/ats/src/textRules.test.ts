import { describe, expect, it } from 'vitest'
import { createDocument, applyOperations, type DesignDocument } from '@designo/core'
import { getPlacedNodes } from './scope.ts'
import { checkTextExtraction } from './textRules.ts'
import type { PdfFacts } from './types.ts'

const documentWith = (text: string, properties: Record<string, unknown> = {}): DesignDocument => {
  const result = applyOperations(createDocument('f', 'Resume', 'page'), [
    {
      kind: 'create',
      id: 'name',
      type: 'text',
      parentId: 'page',
      properties: { x: 10, y: 10, width: 200, height: 20, text, ...properties }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const factsOf = (...strings: string[]): PdfFacts => ({
  pages: [
    {
      width: 600,
      height: 800,
      items: strings.map((text, index) => ({
        text,
        x: 10,
        y: 10 + index * 20,
        width: 50,
        height: 10
      }))
    }
  ],
  fonts: [],
  links: []
})

const run = (document: DesignDocument, facts: PdfFacts) =>
  checkTextExtraction(getPlacedNodes(document), facts)

describe('checkTextExtraction', () => {
  it('passes both rules when the text is found as written', () => {
    const findings = run(documentWith('Jane Doe'), factsOf('Jane Doe'))
    expect(findings.map((finding) => [finding.rule, finding.status])).toEqual([
      ['selectable-text', 'pass'],
      ['text-extraction', 'pass']
    ])
  })

  it('fails a text that is not in the PDF at all', () => {
    const findings = run(documentWith('Jane Doe'), factsOf('Something else'))
    expect(findings).toEqual([
      expect.objectContaining({ rule: 'selectable-text', status: 'fail', nodeId: 'name', page: 1 }),
      expect.objectContaining({ rule: 'text-extraction', status: 'pass' })
    ])
  })

  it('warns when the letters are found but the spaces are lost', () => {
    const findings = run(documentWith('Jane Doe'), factsOf('JaneDoe'))
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'text-extraction', status: 'warn', nodeId: 'name' })
    )
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'selectable-text', status: 'pass' })
    )
  })

  it('fails a text with a blur, which is an image in the PDF', () => {
    const findings = run(documentWith('Jane Doe', { blur: 4 }), factsOf('Jane Doe'))
    expect(findings[0]).toMatchObject({ rule: 'selectable-text', status: 'fail' })
  })

  it('matches each paragraph and ignores list markers between them', () => {
    const findings = run(documentWith('one\ntwo'), factsOf('• one', '• two'))
    expect(findings.every((finding) => finding.status === 'pass')).toBe(true)
  })
})
