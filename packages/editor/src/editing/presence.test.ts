import { applyOperations, createDocument, type DesignDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { createComment, getCommentPins, guestName, toRemoteMarks } from './presence.ts'

const documentWithBox = (): DesignDocument => {
  const result = applyOperations(createDocument('doc', 'Doc', 'page'), [
    {
      kind: 'create',
      id: 'box',
      type: 'rectangle',
      parentId: 'page',
      properties: { x: 100, y: 50, width: 80, height: 40 }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const content = { id: 'c1', text: '  Bolder?  ', author: 'Ada', createdAt: '2026-11-27T06:00:00Z' }

describe('presence and comments in the editor', () => {
  it('keeps only the remote selection that is on the shown page', () => {
    const marks = toRemoteMarks(
      [
        {
          clientId: 3,
          user: { name: 'Ada', color: '#0090ff', kind: 'person' },
          selection: ['box', 'elsewhere'],
          cursor: { x: 1, y: 2 }
        }
      ],
      documentWithBox()
    )
    expect(marks).toEqual([
      { clientId: 3, name: 'Ada', color: '#0090ff', selection: ['box'], cursor: { x: 1, y: 2 } }
    ])
  })

  it('pins a new comment to the top right of the selected node, or to the page point', () => {
    const document = documentWithBox()
    expect(
      createComment(
        document,
        { selection: ['box'], pageId: 'page', point: { x: 0, y: 0 } },
        content
      )
    ).toMatchObject({ nodeId: 'box', x: 80, y: 0, text: 'Bolder?', resolved: false })
    expect(
      createComment(document, { selection: [], pageId: 'page', point: { x: 30, y: 40 } }, content)
    ).toMatchObject({ nodeId: 'page', x: 30, y: 40 })
  })

  it('places the open comments on the screen, numbered oldest first', () => {
    const base = documentWithBox()
    const older = createComment(
      base,
      { selection: ['box'], pageId: 'page', point: { x: 0, y: 0 } },
      content
    )
    const newer = { ...older, id: 'c2', createdAt: '2026-11-27T07:00:00Z', x: 0 }
    const resolved = { ...older, id: 'c3', resolved: true }
    const document = { ...base, comments: { c2: newer, c1: older, c3: resolved } }
    const pins = getCommentPins(document, { offsetX: 10, offsetY: 20, scale: 2 })
    expect(pins.map((pin) => [pin.comment.id, pin.number, pin.screen])).toEqual([
      ['c1', 1, { x: 370, y: 120 }],
      ['c2', 2, { x: 210, y: 120 }]
    ])
  })

  it('names a guest the same way for the same seed', () => {
    expect(guestName(9)).toBe(guestName(9))
    expect(guestName(9)).toMatch(/^Guest \w+$/)
  })
})
