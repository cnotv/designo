import { applyOperations, createDocument, type DesignDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { findStaleTextBoxes } from './textRefit.ts'

const documentWith = (properties: object): DesignDocument => {
  const result = applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'label',
      type: 'text',
      parentId: 'page',
      properties: { text: '#2d6a4f', fontSize: 14, width: 57, height: 17, ...properties }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}

describe('findStaleTextBoxes', () => {
  it('resizes an auto width text to its shaped size, rounded up', () => {
    const operations = findStaleTextBoxes(documentWith({}), () => ({ width: 60.2, height: 16.8 }))
    expect(operations).toEqual([{ kind: 'update', id: 'label', patch: { width: 61, height: 17 } }])
  })

  it('leaves a text that already fits', () => {
    expect(findStaleTextBoxes(documentWith({}), () => ({ width: 57, height: 17 }))).toEqual([])
  })

  it('leaves a text whose fonts have not loaded, for a later call to fit', () => {
    expect(findStaleTextBoxes(documentWith({}), () => undefined)).toEqual([])
  })

  it('leaves a fixed width text and an empty one', () => {
    const measure = () => ({ width: 90, height: 40 })
    expect(findStaleTextBoxes(documentWith({ textWrap: true }), measure)).toEqual([])
    expect(findStaleTextBoxes(documentWith({ text: '' }), measure)).toEqual([])
  })
})
