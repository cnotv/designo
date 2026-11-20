import { CURRENT_FORMAT_VERSION, DEFAULT_NODE_PROPERTIES } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addPageSetupToNode, migratePageSetup } from './migratePageSetup.ts'
import { parseStoredDocument } from './migrations.ts'

const versionSevenNode = (): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries({
      ...DEFAULT_NODE_PROPERTIES,
      id: 'page-p',
      type: 'page',
      parentId: null,
      order: 0
    }).filter(([key]) => !['pageUnit', 'bleed', 'facing', 'guides'].includes(key))
  )

const versionSevenFile = (): Record<string, unknown> => ({
  id: 'file-1',
  name: 'Old',
  rootId: 'page-p',
  formatVersion: 7,
  nodes: { 'page-p': versionSevenNode() }
})

describe('migratePageSetup', () => {
  it('gives every node a page setup that prints as before', () => {
    expect(migratePageSetup(versionSevenFile()).nodes).toEqual({
      'page-p': { ...versionSevenNode(), pageUnit: 'pt', bleed: 0, facing: 'single', guides: null }
    })
  })

  it('keeps a page setup a node already has', () => {
    expect(addPageSetupToNode({ ...versionSevenNode(), bleed: 9 })).toMatchObject({ bleed: 9 })
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    expect(() => parseStoredDocument({ ...versionSevenFile(), nodes: { broken: 5 } })).toThrow()
  })

  it('opens a version 7 file as a current document', () => {
    expect(parseStoredDocument(versionSevenFile()).formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })
})
