import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addEffectsToNode, migrateEffects } from './migrateEffects.ts'
import { parseStoredDocument } from './migrations.ts'

const EFFECT_NAMES = ['gradient', 'blur', 'blendMode', 'shadow']
const VERSION_FOUR_DEFAULTS = { gradient: null, blur: 0, blendMode: 'normal', shadow: null }

const withoutEffects = (node: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(node).filter(([key]) => !EFFECT_NAMES.includes(key)))

const versionThreePage = (): Record<string, unknown> =>
  withoutEffects(createDocument('file-e', 'Washes', 'page-e').nodes['page-e'] ?? {})

const versionThreeFile = (): Record<string, unknown> => ({
  ...createDocument('file-e', 'Washes', 'page-e'),
  formatVersion: 3,
  nodes: { 'page-e': versionThreePage() }
})

describe('migrateEffects', () => {
  it('gives every node the defaults that match how version 3 drew it', () => {
    expect(migrateEffects(versionThreeFile()).nodes).toEqual({
      'page-e': { ...versionThreePage(), ...VERSION_FOUR_DEFAULTS }
    })
  })

  it('keeps a value the node already has', () => {
    expect(addEffectsToNode({ ...versionThreePage(), blur: 4 })).toMatchObject({
      blur: 4,
      blendMode: 'normal'
    })
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    expect(() => parseStoredDocument({ ...versionThreeFile(), nodes: { broken: 5 } })).toThrow()
  })

  it('opens a version 3 file as a current document', () => {
    expect(parseStoredDocument(versionThreeFile()).formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })
})
