import { describe, expect, it } from 'vitest'
import { applyOperation, applyOperations, createDocument, getChildren } from './document.ts'
import { invertOperations } from './history.ts'
import type { DesignDocument, DesignOperation, OperationResult } from './types.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const withComponent = unwrap(
  applyOperations(createDocument('file-1', 'Test', 'page-1'), [
    {
      kind: 'create',
      id: 'card',
      type: 'frame',
      parentId: 'page-1',
      properties: { fill: '#ffffff' }
    },
    { kind: 'create', id: 'title', type: 'text', parentId: 'card', properties: { text: 'Title' } },
    { kind: 'update', id: 'card', patch: { isComponent: true } }
  ])
)

const withInstance = unwrap(
  applyOperation(withComponent, {
    kind: 'createInstance',
    id: 'copy',
    componentId: 'card',
    parentId: 'page-1',
    x: 300,
    y: 40
  })
)

const instanceTitle = (document: DesignDocument) => document.nodes['copy:title']

describe('createInstance', () => {
  it('copies the component tree and keeps its own position', () => {
    expect(withInstance.nodes['copy']).toMatchObject({
      sourceId: 'card',
      x: 300,
      y: 40,
      fill: '#ffffff'
    })
    expect(instanceTitle(withInstance)).toMatchObject({
      parentId: 'copy',
      text: 'Title',
      sourceId: 'title'
    })
  })

  it('refuses something that is not a component', () => {
    const result = applyOperation(withComponent, {
      kind: 'createInstance',
      id: 'bad',
      componentId: 'title',
      parentId: 'page-1'
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a place inside the component or inside another instance', () => {
    const inside = {
      kind: 'createInstance',
      id: 'a',
      componentId: 'card',
      parentId: 'card'
    } as const
    const nested = {
      kind: 'createInstance',
      id: 'b',
      componentId: 'card',
      parentId: 'copy'
    } as const
    expect(applyOperation(withInstance, inside).ok).toBe(false)
    expect(applyOperation(withInstance, nested).ok).toBe(false)
  })
})

describe('positions', () => {
  it('keeps the children of an instance inside it, and moves them with it', () => {
    expect(instanceTitle(withInstance)).toMatchObject({ x: 300, y: 40 })
  })

  it('does not count moving the whole instance as an override', () => {
    const moved = unwrap(
      applyOperations(withInstance, [
        { kind: 'update', id: 'copy', patch: { x: 500 } },
        { kind: 'update', id: 'copy:title', patch: { x: 500, y: 40 } }
      ])
    )
    expect(instanceTitle(moved)).toMatchObject({ x: 500, y: 40 })
    expect(instanceTitle(moved)?.overrides ?? []).toEqual([])
  })
})

describe('following the component', () => {
  it('passes a component change to instances', () => {
    const changed = unwrap(
      applyOperation(withInstance, { kind: 'update', id: 'title', patch: { text: 'New' } })
    )
    expect(instanceTitle(changed)?.text).toBe('New')
  })

  it('adds and removes children on instances', () => {
    const added = unwrap(
      applyOperation(withInstance, {
        kind: 'create',
        id: 'badge',
        type: 'ellipse',
        parentId: 'card'
      })
    )
    expect(getChildren(added, 'copy').map((node) => node.sourceId)).toEqual(['title', 'badge'])
    const removed = unwrap(applyOperation(added, { kind: 'delete', id: 'title' }))
    expect(getChildren(removed, 'copy').map((node) => node.sourceId)).toEqual(['badge'])
  })

  it('never copies the component name, position or pdf page onto its instance', () => {
    const changed = unwrap(
      applyOperation(withInstance, {
        kind: 'update',
        id: 'card',
        patch: { name: 'Renamed', x: 5, pdfPage: 2, fill: '#000000' }
      })
    )
    expect(changed.nodes['copy']).toMatchObject({ x: 300, fill: '#000000', pdfPage: null })
    expect(changed.nodes['copy']?.name).not.toBe('Renamed')
  })
})

describe('overrides', () => {
  const overridden = unwrap(
    applyOperation(withInstance, { kind: 'update', id: 'copy:title', patch: { text: 'Mine' } })
  )

  it('keeps an edited property when the component changes', () => {
    const changed = unwrap(
      applyOperation(overridden, {
        kind: 'update',
        id: 'title',
        patch: { text: 'New', fontSize: 30 }
      })
    )
    expect(instanceTitle(changed)).toMatchObject({
      text: 'Mine',
      fontSize: 30,
      overrides: ['text']
    })
  })

  it('drops an override that is set back to the component value', () => {
    const back = unwrap(
      applyOperation(overridden, { kind: 'update', id: 'copy:title', patch: { text: 'Title' } })
    )
    expect(instanceTitle(back)?.overrides).toEqual([])
  })

  it('resets overrides to the component values', () => {
    const reset = unwrap(applyOperation(overridden, { kind: 'resetOverrides', id: 'copy' }))
    expect(instanceTitle(reset)).toMatchObject({ text: 'Title', overrides: [] })
  })
})

describe('detachInstance', () => {
  it('turns the instance into plain nodes', () => {
    const detached = unwrap(applyOperation(withInstance, { kind: 'detachInstance', id: 'copy' }))
    const changed = unwrap(
      applyOperation(detached, { kind: 'update', id: 'title', patch: { text: 'New' } })
    )
    expect(instanceTitle(changed)).toMatchObject({ text: 'Title' })
    expect(instanceTitle(changed)?.sourceId).toBeUndefined()
  })

  it('refuses a node inside an instance', () => {
    expect(applyOperation(withInstance, { kind: 'detachInstance', id: 'copy:title' }).ok).toBe(
      false
    )
  })
})

describe('edits inside an instance', () => {
  const refused: DesignOperation[] = [
    { kind: 'delete', id: 'copy:title' },
    { kind: 'move', id: 'copy:title', parentId: 'page-1' },
    { kind: 'create', id: 'extra', type: 'rectangle', parentId: 'copy' },
    { kind: 'update', id: 'copy', patch: { isComponent: true } }
  ]
  it.each(refused)('refuses %j', (operation) => {
    expect(applyOperation(withInstance, operation).ok).toBe(false)
  })

  it('allows moving and deleting the instance itself', () => {
    expect(applyOperation(withInstance, { kind: 'delete', id: 'copy' }).ok).toBe(true)
  })
})

describe('making a component', () => {
  it('refuses a rectangle, and a frame next to a component ancestor', () => {
    const rectangle = applyOperations(withComponent, [
      { kind: 'create', id: 'r', type: 'rectangle', parentId: 'page-1' },
      { kind: 'update', id: 'r', patch: { isComponent: true } }
    ])
    const inner = applyOperations(withComponent, [
      { kind: 'create', id: 'f', type: 'frame', parentId: 'card' },
      { kind: 'update', id: 'f', patch: { isComponent: true } }
    ])
    expect(rectangle.ok).toBe(false)
    expect(inner.ok).toBe(false)
  })
})

describe('undo', () => {
  const roundTrip = (document: DesignDocument, operation: DesignOperation): DesignDocument => {
    const inverse = invertOperations(document, [operation])
    return unwrap(applyOperations(unwrap(applyOperation(document, operation)), inverse))
  }

  it('undoes creating, detaching and resetting', () => {
    const overridden = unwrap(
      applyOperation(withInstance, { kind: 'update', id: 'copy:title', patch: { text: 'Mine' } })
    )
    expect(
      roundTrip(withComponent, {
        kind: 'createInstance',
        id: 'copy',
        componentId: 'card',
        parentId: 'page-1'
      }).nodes
    ).toEqual(withComponent.nodes)
    expect(roundTrip(overridden, { kind: 'detachInstance', id: 'copy' }).nodes).toEqual(
      overridden.nodes
    )
    expect(roundTrip(overridden, { kind: 'resetOverrides', id: 'copy' }).nodes).toEqual(
      overridden.nodes
    )
  })
})
