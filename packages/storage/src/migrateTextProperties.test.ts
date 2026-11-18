import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addTextPropertiesToNode, migrateTextProperties } from './migrateTextProperties.ts'
import { parseStoredDocument } from './migrations.ts'

const TEXT_PROPERTY_NAMES = ['textAlign', 'lineHeight', 'textWrap']

const withoutTextProperties = (node: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(node).filter(([key]) => !TEXT_PROPERTY_NAMES.includes(key)))

const VERSION_THREE_DEFAULTS = { textAlign: 'left', lineHeight: 1.2, textWrap: false }

const versionTwoPage = (): Record<string, unknown> =>
  withoutTextProperties(createDocument('file-t', 'Words', 'page-t').nodes['page-t'] ?? {})

const versionTwoLabel = (): Record<string, unknown> => ({
  ...versionTwoPage(),
  id: 'label',
  type: 'text',
  parentId: 'page-t',
  order: 1,
  text: 'Hello\nworld',
  fontSize: 20,
  width: 90,
  height: 50
})

// A file as version 2 wrote it: no node has the three text properties.
const versionTwoFile = (): Record<string, unknown> => ({
  ...createDocument('file-t', 'Words', 'page-t'),
  formatVersion: 2,
  nodes: { 'page-t': versionTwoPage(), label: versionTwoLabel() }
})

describe('migrateTextProperties', () => {
  it('gives every node the defaults that match how version 2 drew text', () => {
    expect(migrateTextProperties(versionTwoFile()).nodes).toEqual({
      'page-t': { ...versionTwoPage(), ...VERSION_THREE_DEFAULTS },
      label: { ...versionTwoLabel(), ...VERSION_THREE_DEFAULTS }
    })
  })

  it('keeps a value the node already has', () => {
    expect(
      addTextPropertiesToNode({ ...versionTwoLabel(), textAlign: 'right', lineHeight: 2 })
    ).toEqual({
      ...versionTwoLabel(),
      textAlign: 'right',
      lineHeight: 2,
      textWrap: false
    })
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    expect(migrateTextProperties({ ...versionTwoFile(), nodes: { broken: 5 } }).nodes).toEqual({
      broken: 5
    })
    expect(() => parseStoredDocument({ ...versionTwoFile(), nodes: { broken: 5 } })).toThrow()
  })

  it('does not mutate its input', () => {
    const raw = versionTwoFile()
    const copy = structuredClone(raw)
    migrateTextProperties(raw)
    expect(raw).toEqual(copy)
  })

  it('opens a version 2 file at the current version, validated and otherwise unchanged', () => {
    const document = parseStoredDocument(versionTwoFile())
    expect(document.formatVersion).toBe(CURRENT_FORMAT_VERSION)
    expect(document.nodes['label']).toEqual({
      ...versionTwoLabel(),
      ...VERSION_THREE_DEFAULTS
    })
  })
})
