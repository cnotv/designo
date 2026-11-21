import { applyOperations, createDocument, type DesignDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  createDetachOperations,
  createInstanceOperations,
  createMakeComponentOperations,
  createResetOverridesOperations
} from './components.ts'

const base = createDocument('file', 'File', 'page')
const apply = (
  document: DesignDocument,
  change: { operations: Parameters<typeof applyOperations>[1] }
) => {
  const result = applyOperations(document, change.operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const withFrame = apply(base, {
  operations: [
    {
      kind: 'create',
      id: 'card',
      type: 'frame',
      parentId: 'page',
      properties: { x: 10, y: 20, width: 100 }
    },
    { kind: 'create', id: 'rect', type: 'rectangle', parentId: 'page' }
  ]
})
const withComponent = apply(withFrame, createMakeComponentOperations(withFrame, ['card']))

describe('component actions', () => {
  it('makes a component once, from one selected node', () => {
    expect(createMakeComponentOperations(withFrame, ['card']).operations).toHaveLength(1)
    expect(createMakeComponentOperations(withComponent, ['card']).operations).toEqual([])
    expect(createMakeComponentOperations(withFrame, ['card', 'rect']).operations).toEqual([])
  })

  it('places an instance beside the component and selects it', () => {
    const change = createInstanceOperations(withComponent, ['card'], 'copy')
    expect(change.selection).toEqual(['copy'])
    expect(apply(withComponent, change).nodes['copy']).toMatchObject({ x: 134, y: 20 })
    expect(createInstanceOperations(withFrame, ['card'], 'copy').operations).toEqual([])
  })

  it('detaches and resets only instances', () => {
    const withInstance = apply(
      withComponent,
      createInstanceOperations(withComponent, ['card'], 'copy')
    )
    expect(createDetachOperations(withInstance, ['copy', 'card']).operations).toEqual([
      { kind: 'detachInstance', id: 'copy' }
    ])
    expect(createResetOverridesOperations(withInstance, ['copy', 'card']).operations).toEqual([
      { kind: 'resetOverrides', id: 'copy' }
    ])
  })
})
