import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from '@designo/core'
import { describeFindingPlace, sortFindingsBySeverity } from './atsReport.ts'

const finding = (status: 'pass' | 'warn' | 'fail', rule: string) => ({
  rule,
  status,
  message: rule
})

describe('sortFindingsBySeverity', () => {
  it('puts failures first, then warnings, then passes, keeping order inside each', () => {
    const sorted = sortFindingsBySeverity([
      finding('pass', 'a'),
      finding('warn', 'b'),
      finding('fail', 'c'),
      finding('warn', 'd')
    ])
    expect(sorted.map((item) => item.rule)).toEqual(['c', 'b', 'd', 'a'])
  })
})

describe('describeFindingPlace', () => {
  const result = applyOperations(createDocument('f', 'CV', 'page'), [
    { kind: 'create', id: 'title', type: 'text', parentId: 'page', properties: { name: 'Name' } }
  ])
  if (!result.ok) throw new Error(result.error)

  it('names the layer and the page', () => {
    expect(
      describeFindingPlace(result.document, { ...finding('fail', 'x'), nodeId: 'title', page: 2 })
    ).toBe('Name, page 2')
  })

  it('is empty for a finding on the whole file', () => {
    expect(describeFindingPlace(result.document, finding('pass', 'x'))).toBe('')
  })
})
