import {
  applyOperations,
  createDocument,
  invertOperations,
  type DesignDocument
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { repairDocument } from './repair.ts'
import {
  applyOperationsToLiveDocument,
  readLiveDocument,
  seedLiveDocument
} from './liveDocument.ts'

const startingDocument = (): DesignDocument => {
  const result = applyOperations(createDocument('doc', 'Doc', 'page'), [
    { kind: 'create', id: 'box', type: 'rectangle', parentId: 'page', properties: { x: 0 } },
    { kind: 'create', id: 'frame', type: 'frame', parentId: 'page', properties: { x: 300 } }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

// Two clients that exchange every update, as the sync server relays them.
const connectedPair = (): { first: Y.Doc; second: Y.Doc } => {
  const first = new Y.Doc()
  const second = new Y.Doc()
  seedLiveDocument(first, startingDocument(), { kind: 'disk' })
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first))
  return { first, second }
}

const exchange = (first: Y.Doc, second: Y.Doc): void => {
  const fromFirst = Y.encodeStateAsUpdate(first, Y.encodeStateVector(second))
  const fromSecond = Y.encodeStateAsUpdate(second, Y.encodeStateVector(first))
  Y.applyUpdate(second, fromFirst)
  Y.applyUpdate(first, fromSecond)
}

const readOrThrow = (yDocument: Y.Doc): DesignDocument => {
  const document = readLiveDocument(yDocument)
  if (!document) throw new Error('The live document did not parse')
  return document
}

describe('live documents', () => {
  it('reads back the document it was seeded with', () => {
    const yDocument = new Y.Doc()
    seedLiveDocument(yDocument, startingDocument(), { kind: 'disk' })
    expect(readLiveDocument(yDocument)).toEqual(startingDocument())
  })

  it('keeps both of two concurrent edits to different properties of one node', () => {
    const { first, second } = connectedPair()
    applyOperationsToLiveDocument(first, [{ kind: 'update', id: 'box', patch: { x: 40 } }], {
      kind: 'operations',
      clientId: first.clientID
    })
    applyOperationsToLiveDocument(
      second,
      [{ kind: 'update', id: 'box', patch: { fill: '#ff0000' } }],
      {
        kind: 'operations',
        clientId: second.clientID
      }
    )
    exchange(first, second)
    expect(readOrThrow(first)).toEqual(readOrThrow(second))
    expect(readOrThrow(first).nodes.box).toMatchObject({ x: 40, fill: '#ff0000' })
  })

  it('undoes only the edits of the client that undoes', () => {
    const { first, second } = connectedPair()
    const move = [{ kind: 'update', id: 'box', patch: { x: 40 } }] as const
    const undoMove = invertOperations(readOrThrow(first), move)
    applyOperationsToLiveDocument(first, move, { kind: 'operations', clientId: first.clientID })
    applyOperationsToLiveDocument(
      second,
      [{ kind: 'update', id: 'box', patch: { fill: '#00ff00' } }],
      {
        kind: 'operations',
        clientId: second.clientID
      }
    )
    exchange(first, second)
    applyOperationsToLiveDocument(first, undoMove, { kind: 'operations', clientId: first.clientID })
    exchange(first, second)
    expect(readOrThrow(second).nodes.box).toMatchObject({ x: 0, fill: '#00ff00' })
  })

  it('refuses a batch that fails, writing nothing', () => {
    const yDocument = new Y.Doc()
    seedLiveDocument(yDocument, startingDocument(), { kind: 'disk' })
    const result = applyOperationsToLiveDocument(yDocument, [{ kind: 'delete', id: 'missing' }], {
      kind: 'repair'
    })
    expect(result.ok).toBe(false)
    expect(readLiveDocument(yDocument)).toEqual(startingDocument())
  })

  it('repairs a node moved into a frame someone else deleted', () => {
    const { first, second } = connectedPair()
    applyOperationsToLiveDocument(
      first,
      [{ kind: 'move', id: 'box', parentId: 'frame', order: 0 }],
      {
        kind: 'operations',
        clientId: first.clientID
      }
    )
    applyOperationsToLiveDocument(second, [{ kind: 'delete', id: 'frame' }], {
      kind: 'operations',
      clientId: second.clientID
    })
    exchange(first, second)
    const merged = readOrThrow(first)
    expect(merged.nodes.box?.parentId).toBe('frame')
    expect(merged.nodes.frame).toBeUndefined()
    const repaired = repairDocument(merged)
    expect(Object.keys(repaired.nodes).toSorted()).toEqual(['page'])
  })
})
