import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument, getChildren } from './document.ts'
import { PAGE_NUMBER_TOKEN, resolveMasters } from './masters.ts'
import type { DesignDocument, DesignOperation } from './types.ts'

const build = (operations: readonly DesignOperation[]): DesignDocument => {
  const result = applyOperations(createDocument('doc', 'Book', 'root'), operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const frame = (
  id: string,
  x: number,
  properties: Record<string, unknown> = {}
): DesignOperation => ({
  kind: 'create',
  id,
  type: 'frame',
  parentId: 'root',
  properties: { x, y: 0, width: 200, height: 300, ...properties }
})

const bookWithMaster = (): DesignDocument =>
  build([
    frame('master', 1000, { isMaster: true }),
    {
      kind: 'create',
      id: 'footer',
      type: 'text',
      parentId: 'master',
      properties: { x: 1010, y: 280, text: `Page ${PAGE_NUMBER_TOKEN}`, textWrap: true, width: 100 }
    },
    {
      kind: 'create',
      id: 'rule',
      type: 'rectangle',
      parentId: 'master',
      properties: { x: 1010, y: 270, width: 180, height: 1 }
    },
    frame('first', 0, { pdfPage: 1 }),
    frame('second', 300, { pdfPage: 2 }),
    { kind: 'update', id: 'first', patch: { masterId: 'master' } },
    { kind: 'update', id: 'second', patch: { masterId: 'master' } }
  ])

describe('resolveMasters', () => {
  it('returns the same document when no page uses a master', () => {
    const document = build([frame('plain', 0)])
    expect(resolveMasters(document)).toBe(document)
  })

  it('copies the master children into each page, moved to the page', () => {
    const resolved = resolveMasters(bookWithMaster())
    const rule = getChildren(resolved, 'second').find((node) => node.type === 'rectangle')
    expect(rule?.x).toBe(310)
    expect(rule?.y).toBe(270)
  })

  it('draws the master behind the page own nodes', () => {
    const document = build([
      frame('master', 1000, { isMaster: true }),
      { kind: 'create', id: 'band', type: 'rectangle', parentId: 'master' },
      frame('page', 0),
      { kind: 'create', id: 'own', type: 'rectangle', parentId: 'page' },
      { kind: 'update', id: 'page', patch: { masterId: 'master' } }
    ])
    const ids = getChildren(resolveMasters(document), 'page').map((node) =>
      node.id.split(':').at(-1)
    )
    expect(ids).toEqual(['band', 'own'])
  })

  it('shows each page its own number, from pdfPage', () => {
    const resolved = resolveMasters(bookWithMaster())
    const texts = (pageId: string): string[] =>
      getChildren(resolved, pageId).flatMap((node) => (node.type === 'text' ? [node.text] : []))
    expect(texts('first')).toEqual(['Page 1'])
    expect(texts('second')).toEqual(['Page 2'])
  })

  it('numbers pages without pdfPage by their position', () => {
    const document = build([
      frame('master', 1000, { isMaster: true }),
      {
        kind: 'create',
        id: 'n',
        type: 'text',
        parentId: 'master',
        properties: { text: PAGE_NUMBER_TOKEN }
      },
      frame('a', 0),
      frame('b', 300),
      { kind: 'update', id: 'a', patch: { masterId: 'master' } },
      { kind: 'update', id: 'b', patch: { masterId: 'master' } }
    ])
    const resolved = resolveMasters(document)
    expect(getChildren(resolved, 'b')[0]?.text).toBe('2')
  })

  it('follows a change to the master', () => {
    const changed = applyOperations(bookWithMaster(), [
      { kind: 'update', id: 'rule', patch: { height: 5 } }
    ])
    if (!changed.ok) throw new Error(changed.error)
    const rule = getChildren(resolveMasters(changed.document), 'first').find(
      (node) => node.type === 'rectangle'
    )
    expect(rule?.height).toBe(5)
  })

  it('leaves out the master nodes a page hides', () => {
    const document = bookWithMaster()
    const hidden = applyOperations(document, [
      { kind: 'update', id: 'second', patch: { masterHidden: ['footer'] } }
    ])
    if (!hidden.ok) throw new Error(hidden.error)
    const resolved = resolveMasters(hidden.document)
    expect(getChildren(resolved, 'second').map((node) => node.type)).toEqual(['rectangle'])
    expect(getChildren(resolved, 'first').map((node) => node.type)).toContain('text')
  })

  it('ignores a master that is missing or is the page itself', () => {
    const document = build([
      frame('page', 0),
      { kind: 'update', id: 'page', patch: { masterId: 'page' } }
    ])
    expect(resolveMasters(document)).toBe(document)
  })

  it('does not change the document it is given', () => {
    const document = bookWithMaster()
    const before = JSON.stringify(document)
    resolveMasters(document)
    expect(JSON.stringify(document)).toBe(before)
  })
})
