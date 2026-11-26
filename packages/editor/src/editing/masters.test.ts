import { applyOperations, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { getMasterChoices, NO_MASTER, readMasterChoice } from './masters.ts'

const document = (() => {
  const result = applyOperations(createDocument('doc', 'Book', 'root'), [
    {
      kind: 'create',
      id: 'master',
      type: 'frame',
      parentId: 'root',
      properties: { name: 'Master' }
    },
    { kind: 'update', id: 'master', patch: { isMaster: true } },
    { kind: 'create', id: 'page', type: 'frame', parentId: 'root' },
    { kind: 'create', id: 'other', type: 'frame', parentId: 'root' }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
})()

describe('getMasterChoices', () => {
  it('offers no master first, then each master frame', () => {
    expect(getMasterChoices(document, 'page')).toEqual([
      { value: NO_MASTER, label: 'None' },
      { value: 'master', label: 'Master' }
    ])
  })

  it('never offers a master to itself', () => {
    expect(getMasterChoices(document, 'master').map((choice) => choice.value)).toEqual([NO_MASTER])
  })
})

describe('readMasterChoice', () => {
  it('reads none as null', () => {
    expect(readMasterChoice(NO_MASTER)).toBeNull()
  })

  it('reads a master id as itself', () => {
    expect(readMasterChoice('master')).toBe('master')
  })

  it('refuses anything that is not text', () => {
    expect(readMasterChoice(3)).toBeUndefined()
  })
})
