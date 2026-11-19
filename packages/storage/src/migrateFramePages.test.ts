import { CURRENT_FORMAT_VERSION, createDocument } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { addFramePageToNode, migrateFramePages } from './migrateFramePages.ts'
import { parseStoredDocument } from './migrations.ts'

const withoutFramePage = (node: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'pdfPage'))

const versionFivePage = (): Record<string, unknown> =>
  withoutFramePage(createDocument('file-p', 'Book', 'page-p').nodes['page-p'] ?? {})

const versionFiveFile = (): Record<string, unknown> => ({
  ...createDocument('file-p', 'Book', 'page-p'),
  formatVersion: 5,
  nodes: { 'page-p': versionFivePage() }
})

describe('migrateFramePages', () => {
  it('marks no node as a PDF page, so the file exports as it did', () => {
    expect(migrateFramePages(versionFiveFile()).nodes).toEqual({
      'page-p': { ...versionFivePage(), pdfPage: null }
    })
  })

  it('keeps a value the node already has', () => {
    expect(addFramePageToNode({ ...versionFivePage(), pdfPage: 3 })).toMatchObject({ pdfPage: 3 })
  })

  it('leaves a node it cannot read for the schema to reject', () => {
    expect(() => parseStoredDocument({ ...versionFiveFile(), nodes: { broken: 5 } })).toThrow()
  })

  it('opens a version 5 file as a current document', () => {
    expect(parseStoredDocument(versionFiveFile()).formatVersion).toBe(CURRENT_FORMAT_VERSION)
  })
})
