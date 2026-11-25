import { describe, expect, it } from 'vitest'
import { createDocument } from '@designo/core'
import { createMetadataOperations, readPdfTag } from './pdfMetadata.ts'

const document = {
  ...createDocument('file', 'File', 'page'),
  metadata: { title: 'CV' }
}

describe('createMetadataOperations', () => {
  it('sets a field with the text typed, trimmed', () => {
    expect(createMetadataOperations(document, 'author', '  Jane ')).toEqual([
      { kind: 'updateMetadata', patch: { author: 'Jane' } }
    ])
  })

  it('clears a field when it is emptied', () => {
    expect(createMetadataOperations(document, 'title', ' ')).toEqual([
      { kind: 'updateMetadata', patch: { title: '' } }
    ])
  })

  it('makes no operation when nothing changed', () => {
    expect(createMetadataOperations(document, 'title', 'CV')).toEqual([])
    expect(createMetadataOperations(document, 'subject', '')).toEqual([])
  })
})

describe('readPdfTag', () => {
  it('reads a tag, and none as null', () => {
    expect(readPdfTag('h2')).toBe('h2')
    expect(readPdfTag('none')).toBeNull()
  })

  it('ignores what is not a tag', () => {
    expect(readPdfTag('h7')).toBeUndefined()
    expect(readPdfTag(3)).toBeUndefined()
  })
})
