import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { MIGRATION_STEPS, migrateRawDocument, parseStoredDocument } from './migrations.ts'
import type { MigrationSteps } from './types.ts'

// A made-up v0 file that called the name "title"; proves the pipeline before a real bump exists.
const versionZeroFile = (): Record<string, unknown> => {
  const { name, ...rest } = createDocument('file-a', 'Old', 'page-a')
  return { ...rest, formatVersion: 0, title: name }
}

// The fixture step sits below the real ones, so an old file runs through every step to the current.
const renameTitleToName: MigrationSteps = {
  ...MIGRATION_STEPS,
  0: ({ title, ...rest }) => ({ ...rest, name: title })
}

describe('migrations', () => {
  it('passes a current file through untouched', () => {
    const document = createDocument('file-a', 'A', 'page-a')
    expect(parseStoredDocument(document)).toEqual(document)
  })

  it('upgrades an old file step by step and validates the result', () => {
    const upgraded = parseStoredDocument(versionZeroFile(), renameTitleToName)
    expect(upgraded).toEqual(createDocument('file-a', 'Old', 'page-a'))
    expect(upgraded.formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })

  it('runs several steps in order', () => {
    const steps: MigrationSteps = {
      0: (raw) => ({ ...raw, trail: ['0'] }),
      1: (raw) => ({ ...raw, trail: [...(Array.isArray(raw.trail) ? raw.trail : []), '1'] })
    }
    expect(migrateRawDocument({ formatVersion: 0 }, 2, steps)).toEqual({
      formatVersion: 2,
      trail: ['0', '1']
    })
  })

  it('does not mutate its input', () => {
    const raw = versionZeroFile()
    const copy = structuredClone(raw)
    parseStoredDocument(raw, renameTitleToName)
    expect(raw).toEqual(copy)
  })

  it('fails clearly on a file newer than the code understands', () => {
    expect(() => parseStoredDocument({ formatVersion: CURRENT_FORMAT_VERSION + 1 })).toThrow(
      /only understands up to/
    )
  })

  it('fails when a step is missing', () => {
    expect(() => parseStoredDocument(versionZeroFile(), {})).toThrow(/No migration exists from/)
  })

  it('rejects input that is not a versioned object', () => {
    expect(() => parseStoredDocument('nope')).toThrow(/JSON object/)
    expect(() => parseStoredDocument([])).toThrow(/JSON object/)
    expect(() => parseStoredDocument({ formatVersion: '1' })).toThrow(/formatVersion/)
  })

  it('still validates after migrating', () => {
    expect(() =>
      parseStoredDocument({ ...versionZeroFile(), nodes: 5 }, renameTitleToName)
    ).toThrow()
  })
})
