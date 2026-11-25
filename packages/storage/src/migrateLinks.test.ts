import { createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addLinkToNode, migrateLinks } from './migrateLinks.ts'
import { parseStoredDocument } from './migrations.ts'

const versionTenPage = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(createDocument('file-f', 'Book', 'page-f').nodes['page-f'] ?? {}).filter(
      ([key]) => key !== 'link'
    )
  )

const versionTenFile = (): Record<string, unknown> => ({
  ...createDocument('file-f', 'Book', 'page-f'),
  formatVersion: 10,
  nodes: { 'page-f': versionTenPage() }
})

describe('migrateLinks', () => {
  it('gives every node no link', () => {
    expect(migrateLinks(versionTenFile()).nodes).toEqual({
      'page-f': { ...versionTenPage(), link: null }
    })
  })

  it('keeps a link a node already has', () => {
    expect(addLinkToNode({ link: 'tel:+4917012345' })).toEqual({ link: 'tel:+4917012345' })
  })

  it('leaves what it cannot read for the schema to reject', () => {
    expect(addLinkToNode('x')).toBe('x')
  })

  it('opens a version 10 file as the current version', () => {
    expect(parseStoredDocument(versionTenFile()).nodes['page-f']?.link).toBeNull()
  })
})
