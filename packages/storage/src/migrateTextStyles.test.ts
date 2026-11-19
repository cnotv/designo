import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addTextStylesToNode, migrateTextStyles } from './migrateTextStyles.ts'
import { parseStoredDocument } from './migrations.ts'

const STYLE_NAMES = ['fontWeight', 'fontStyle', 'letterSpacing']
const VERSION_FIVE_DEFAULTS = { fontWeight: 400, fontStyle: 'normal', letterSpacing: 0 }

const withoutStyles = (node: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(node).filter(([key]) => !STYLE_NAMES.includes(key)))

const versionFourPage = (): Record<string, unknown> =>
  withoutStyles(createDocument('file-s', 'Titles', 'page-s').nodes['page-s'] ?? {})

const versionFourFile = (): Record<string, unknown> => ({
  ...createDocument('file-s', 'Titles', 'page-s'),
  formatVersion: 4,
  nodes: { 'page-s': versionFourPage() }
})

describe('migrateTextStyles', () => {
  it('gives every node the defaults that match how version 4 drew text', () => {
    expect(migrateTextStyles(versionFourFile()).nodes).toEqual({
      'page-s': { ...versionFourPage(), ...VERSION_FIVE_DEFAULTS }
    })
  })

  it('keeps a value the node already has', () => {
    expect(addTextStylesToNode({ ...versionFourPage(), fontWeight: 700 })).toMatchObject({
      fontWeight: 700,
      fontStyle: 'normal'
    })
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    expect(() => parseStoredDocument({ ...versionFourFile(), nodes: { broken: 5 } })).toThrow()
  })

  it('opens a version 4 file as a current document', () => {
    expect(parseStoredDocument(versionFourFile()).formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })
})
