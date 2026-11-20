import {
  applyOperations,
  createDocument,
  getPageNodes,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  createAddPageOperations,
  createDeletePageOperations,
  createMovePageOperations,
  createRenamePageOperations,
  getPageToShowAfterDelete,
  resolveActivePageId,
  showPage
} from './pages.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const pageIds = (document: DesignDocument): string[] =>
  getPageNodes(document).map((page) => page.id)

const single = createDocument('file', 'File', 'a')
const three = unwrap(
  applyOperations(single, [
    { kind: 'createPage', id: 'b' },
    { kind: 'createPage', id: 'c' }
  ])
)

describe('active page', () => {
  it('keeps the chosen page while it exists, else falls back to the first', () => {
    expect(resolveActivePageId(three, 'b')).toBe('b')
    expect(resolveActivePageId(three, 'gone')).toBe('a')
    expect(resolveActivePageId(three, undefined)).toBe('a')
  })

  it('shows a page by making it the root, leaving the nodes alone', () => {
    const shown = showPage(three, 'c')
    expect(shown.rootId).toBe('c')
    expect(shown.nodes).toBe(three.nodes)
  })
})

describe('page operations', () => {
  it('adds a page after the others', () => {
    const added = unwrap(applyOperations(three, createAddPageOperations('d')))
    expect(pageIds(added)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('renames a page, trimmed, and ignores an empty name', () => {
    const renamed = unwrap(
      applyOperations(three, createRenamePageOperations(three, 'b', '  Cover '))
    )
    expect(renamed.nodes['b']?.name).toBe('Cover')
    expect(createRenamePageOperations(three, 'b', '   ')).toEqual([])
    expect(createRenamePageOperations(three, 'b', 'Page 2')).toEqual([])
  })

  it('moves a page earlier or later, and not past the ends', () => {
    const later = unwrap(applyOperations(three, createMovePageOperations(three, 'a', 1)))
    expect(pageIds(later)).toEqual(['b', 'a', 'c'])
    const earlier = unwrap(applyOperations(three, createMovePageOperations(three, 'c', -1)))
    expect(pageIds(earlier)).toEqual(['a', 'c', 'b'])
    expect(createMovePageOperations(three, 'a', -1)).toEqual([])
    expect(createMovePageOperations(three, 'c', 1)).toEqual([])
  })

  it('deletes a page, the first included, but never the only one', () => {
    const deleted = unwrap(applyOperations(three, createDeletePageOperations(three, 'a')))
    expect(pageIds(deleted)).toEqual(['b', 'c'])
    expect(deleted.rootId).toBe('b')
    expect(createDeletePageOperations(single, 'a')).toEqual([])
  })

  it('picks the page before a deleted one to show, else the one after', () => {
    expect(getPageToShowAfterDelete(three, 'b')).toBe('a')
    expect(getPageToShowAfterDelete(three, 'a')).toBe('b')
  })
})
