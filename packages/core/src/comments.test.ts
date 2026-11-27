import { describe, expect, it } from 'vitest'
import { getCommentPosition } from './comments.ts'
import { applyOperations, createDocument } from './document.ts'
import { invertOperations } from './history.ts'
import type { DesignComment, DesignDocument } from './types.ts'

const base = (): DesignDocument => {
  const result = applyOperations(createDocument('doc', 'Doc', 'page'), [
    {
      kind: 'create',
      id: 'box',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 100, y: 50 }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const comment: DesignComment = {
  id: 'c1',
  nodeId: 'box',
  x: 10,
  y: 5,
  text: 'Make this blue',
  author: 'Ada',
  createdAt: '2026-11-27T06:00:00.000Z',
  resolved: false
}

describe('comments', () => {
  it('adds, resolves and removes a comment', () => {
    const added = applyOperations(base(), [{ kind: 'setComment', comment }])
    expect(added.ok && added.document.comments?.c1?.text).toBe('Make this blue')
    if (!added.ok) return
    const resolved = applyOperations(added.document, [
      { kind: 'setComment', comment: { ...comment, resolved: true } }
    ])
    expect(resolved.ok && resolved.document.comments?.c1?.resolved).toBe(true)
    const removed = applyOperations(added.document, [{ kind: 'deleteComment', id: 'c1' }])
    expect(removed.ok && removed.document.comments).toBeUndefined()
  })

  it('refuses an empty comment, a missing node and an unknown id', () => {
    expect(
      applyOperations(base(), [{ kind: 'setComment', comment: { ...comment, text: ' ' } }])
    ).toEqual({
      ok: false,
      error: 'Operation 0: A comment needs text'
    })
    expect(
      applyOperations(base(), [{ kind: 'setComment', comment: { ...comment, nodeId: 'gone' } }]).ok
    ).toBe(false)
    expect(applyOperations(base(), [{ kind: 'deleteComment', id: 'c1' }]).ok).toBe(false)
  })

  it('undoes adding and removing a comment', () => {
    const before = base()
    const add = [{ kind: 'setComment' as const, comment }]
    const added = applyOperations(before, add)
    if (!added.ok) throw new Error(added.error)
    const undone = applyOperations(added.document, invertOperations(before, add))
    expect(undone.ok && undone.document.comments).toBeUndefined()
    const remove = [{ kind: 'deleteComment' as const, id: 'c1' }]
    const removed = applyOperations(added.document, remove)
    if (!removed.ok) throw new Error(removed.error)
    const restored = applyOperations(removed.document, invertOperations(added.document, remove))
    expect(restored.ok && restored.document.comments?.c1).toEqual(comment)
  })

  it('pins a comment to its node, or to the page', () => {
    expect(getCommentPosition(base(), comment)).toEqual({ x: 110, y: 55 })
    expect(getCommentPosition(base(), { ...comment, nodeId: null })).toEqual({ x: 10, y: 5 })
  })
})
