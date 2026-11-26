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
  it('lists two sample files and opens the first', () => {
    const { state } = startDemo()
    expect(state.documentSummaries.value).toHaveLength(2)
    expect(state.selectedFileId.value).toBe('sample-palette')
  })

  it('deleting the open file opens the one that is left, and the last one leaves none', () => {
    const { state, demo } = startDemo()
    demo.remove('sample-palette')
    expect(state.selectedFileId.value).toBe('sample-scratch')
    demo.remove('sample-scratch')
    expect(state.documentSummaries.value).toEqual([])
    expect(state.activeDocument.value).toBeUndefined()
  })

  it('keeps the open file when another one is deleted', () => {
    const { state, demo } = startDemo()
    demo.remove('sample-scratch')
    expect(state.selectedFileId.value).toBe('sample-palette')
  })
})
