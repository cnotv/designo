import { createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addImageAssetToNode, migrateImages } from './migrateImages.ts'
import { parseStoredDocument } from './migrations.ts'

const versionEightPage = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(createDocument('file-p', 'Book', 'page-p').nodes['page-p'] ?? {}).filter(
      ([key]) => key !== 'imageAsset'
    )
  )

const versionEightFile = (): Record<string, unknown> => ({
  ...createDocument('file-p', 'Book', 'page-p'),
  formatVersion: 8,
  nodes: { 'page-p': versionEightPage() }
})

describe('migrateImages', () => {
  it('gives every node no picture, so the file draws as it did', () => {
    expect(migrateImages(versionEightFile()).nodes).toEqual({
      'page-p': { ...versionEightPage(), imageAsset: null }
    })
  })

  it('keeps a picture a node already has', () => {
    expect(addImageAssetToNode({ imageAsset: 'a.png' })).toEqual({ imageAsset: 'a.png' })
  })

  it('leaves what it cannot read for the schema to reject', () => {
    expect(addImageAssetToNode('not a node')).toBe('not a node')
    expect(migrateImages({ formatVersion: 8, nodes: 3 })).toEqual({ formatVersion: 8, nodes: 3 })
  })

  it('opens a version 8 file as a current document', () => {
    expect(parseStoredDocument(versionEightFile()).nodes['page-p']?.imageAsset).toBeNull()
  })
})
