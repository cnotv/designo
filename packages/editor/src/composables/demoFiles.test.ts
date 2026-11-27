import type { DesignDocument } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createDemoFiles } from './demoFiles.ts'

const startDemo = () => {
  const state = {
    documentSummaries: ref<DocumentSummary[]>([]),
    selectedFileId: ref<string>(),
    activeDocument: ref<DesignDocument>()
  }
  const demo = createDemoFiles(state)
  demo.start()
  return { state, demo }
}

describe('demo files', () => {
  it('lists three sample files and opens the first', () => {
    const { state } = startDemo()
    expect(state.documentSummaries.value).toHaveLength(3)
    expect(state.selectedFileId.value).toBe('sample-palette')
  })

  it('deleting the open file opens the one that is left, and the last one leaves none', () => {
    const { state, demo } = startDemo()
    demo.remove('sample-palette')
    expect(state.selectedFileId.value).toBe('sample-cv')
    demo.remove('sample-cv')
    demo.remove('sample-scratch')
    expect(state.documentSummaries.value).toEqual([])
    expect(state.activeDocument.value).toBeUndefined()
  })

  it('keeps the open file when another one is deleted', () => {
    const { state, demo } = startDemo()
    demo.remove('sample-scratch')
    expect(state.selectedFileId.value).toBe('sample-palette')
  })

  it('creates an empty file at the end of the list and opens it', () => {
    const { state, demo } = startDemo()
    demo.create()
    expect(state.documentSummaries.value).toHaveLength(4)
    expect(state.documentSummaries.value.at(-1)).toMatchObject({ name: 'Untitled', nodeCount: 1 })
    expect(state.activeDocument.value?.name).toBe('Untitled')
    expect(state.selectedFileId.value).toBe(state.activeDocument.value?.id)
  })

  it('renames a file that is not open and keeps the open one', () => {
    const { state, demo } = startDemo()
    demo.rename('sample-cv', { kind: 'renameDocument', name: 'Resume' })
    expect(state.documentSummaries.value.find((file) => file.id === 'sample-cv')?.name).toBe(
      'Resume'
    )
    expect(state.selectedFileId.value).toBe('sample-palette')
  })
})
