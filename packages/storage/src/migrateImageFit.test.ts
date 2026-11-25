import { createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addImageFitToNode, migrateImageFit } from './migrateImageFit.ts'
import { parseStoredDocument } from './migrations.ts'

const versionNinePage = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(createDocument('file-f', 'Book', 'page-f').nodes['page-f'] ?? {}).filter(
      ([key]) => key !== 'imageFit'
    )
  )

const versionNineFile = (): Record<string, unknown> => ({
  ...createDocument('file-f', 'Book', 'page-f'),
  formatVersion: 9,
  nodes: { 'page-f': versionNinePage() }
})

describe('migrateImageFit', () => {
  it('stretches every picture, as they always were', () => {
    expect(migrateImageFit(versionNineFile()).nodes).toEqual({
      'page-f': { ...versionNinePage(), imageFit: 'stretch' }
    })
  })

  it('keeps a fit a node already has', () => {
    expect(addImageFitToNode({ imageFit: 'fill' })).toEqual({ imageFit: 'fill' })
  })

  it('leaves what it cannot read for the schema to reject', () => {
    expect(addImageFitToNode('x')).toBe('x')
  })

  it('opens a version 9 file as the current version', () => {
    expect(parseStoredDocument(versionNineFile()).nodes['page-f']?.imageFit).toBe('stretch')
  })
})
