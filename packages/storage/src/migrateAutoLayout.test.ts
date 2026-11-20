import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addAutoLayoutToNode, migrateAutoLayout } from './migrateAutoLayout.ts'
import { parseStoredDocument } from './migrations.ts'

const AUTO_LAYOUT_KEYS = [
  'layoutMode',
  'layoutGap',
  'layoutPadding',
  'layoutAlign',
  'layoutCrossAlign',
  'widthSizing',
  'heightSizing'
]

const versionSixPage = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(createDocument('file-p', 'Book', 'page-p').nodes['page-p'] ?? {}).filter(
      ([key]) => !AUTO_LAYOUT_KEYS.includes(key)
    )
  )

const versionSixFile = (): Record<string, unknown> => ({
  ...createDocument('file-p', 'Book', 'page-p'),
  formatVersion: 6,
  nodes: { 'page-p': versionSixPage() }
})

describe('migrateAutoLayout', () => {
  it('turns auto-layout off with every size fixed, so the file lays out as it did', () => {
    expect(migrateAutoLayout(versionSixFile()).nodes).toEqual({
      'page-p': {
        ...versionSixPage(),
        layoutMode: 'none',
        layoutGap: 0,
        layoutPadding: 0,
        layoutAlign: 'start',
        layoutCrossAlign: 'start',
        widthSizing: 'fixed',
        heightSizing: 'fixed'
      }
    })
  })

  it('keeps a value the node already has', () => {
    expect(addAutoLayoutToNode({ ...versionSixPage(), layoutMode: 'vertical' })).toMatchObject({
      layoutMode: 'vertical'
    })
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    expect(() => parseStoredDocument({ ...versionSixFile(), nodes: { broken: 5 } })).toThrow()
  })

  it('opens a version 6 file as a current document', () => {
    expect(parseStoredDocument(versionSixFile()).formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })
})
