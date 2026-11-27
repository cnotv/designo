import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignOperation
} from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { ref, type Ref } from 'vue'
import { nextUntitledFileName } from '../editing/fileNames.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import { createCvDocument } from '../samples/cvDocument.ts'
import { createPaletteDocument } from '../samples/paletteDocument.ts'
import { createScratchDocument } from '../samples/scratchDocument.ts'

const summarizeDocument = (document: DesignDocument): DocumentSummary => ({
  id: document.id,
  name: document.name,
  nodeCount: Object.keys(document.nodes).length
})

/**
 * The bundled sample files for a page with no server: switching, creating, renaming and deleting work in this tab
 * only, and edits to the open file are kept while it is switched away.
 * @param state - The refs the editor reads, which this fills in.
 * @param state.documentSummaries - The list of files.
 * @param state.selectedFileId - Id of the open file.
 * @param state.activeDocument - The open file.
 * @returns Ways to start the demo, switch file, and create, rename and delete a file.
 */
export const createDemoFiles = (state: {
  documentSummaries: Ref<DocumentSummary[]>
  selectedFileId: Ref<string | undefined>
  activeDocument: Ref<DesignDocument | undefined>
}) => {
  const documents = ref<DesignDocument[]>([])

  const keepOpenFile = (): void => {
    const open = state.activeDocument.value
    documents.value = documents.value.map((entry) => (entry.id === open?.id ? open : entry))
  }

  const open = (fileId: string | undefined): void => {
    const next = documents.value.find((entry) => entry.id === fileId)
    state.selectedFileId.value = next?.id
    state.activeDocument.value = next
    state.documentSummaries.value = documents.value.map(summarizeDocument)
  }

  return {
    start: (): void => {
      documents.value = [createPaletteDocument(), createCvDocument(), createScratchDocument()]
      open(documents.value[0]?.id)
    },
    select: (fileId: string): void => {
      keepOpenFile()
      open(fileId)
    },
    create: (): string => {
      keepOpenFile()
      const name = nextUntitledFileName(documents.value.map((entry) => entry.name))
      const created = createDocument(createNodeId('file'), name, createNodeId('page'))
      documents.value = [...documents.value, created]
      open(created.id)
      return created.id
    },
    rename: (fileId: string, operation: DesignOperation): void => {
      keepOpenFile()
      documents.value = documents.value.map((entry) => {
        const renamed = entry.id === fileId ? applyOperations(entry, [operation]) : undefined
        return renamed?.ok ? renamed.document : entry
      })
      open(state.selectedFileId.value)
    },
    remove: (fileId: string): void => {
      keepOpenFile()
      documents.value = documents.value.filter((entry) => entry.id !== fileId)
      open(
        state.selectedFileId.value === fileId ? documents.value[0]?.id : state.selectedFileId.value
      )
    }
  }
}
