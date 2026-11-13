import type { DesignDocument } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { documentSummaryListSchema, storedDocumentSchema } from '@designo/storage/schemas'
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { createPaletteDocument } from '../samples/paletteDocument.ts'

// Polling keeps the loop simple until the Yjs sync server lands; MCP edits show within a second.
const POLL_INTERVAL_MILLISECONDS = 1000

interface DesignoFiles {
  documentSummaries: Ref<DocumentSummary[]>
  selectedFileId: Ref<string | undefined>
  activeDocument: Ref<DesignDocument | undefined>
  isDemo: Ref<boolean>
  selectFile: (fileId: string) => void
}

const isJsonResponse = (response: Response): boolean =>
  response.ok && (response.headers.get('Content-Type') ?? '').includes('application/json')

/**
 * Loads the files from the Designo server and follows changes. Without a server, as on a static
 * host, it falls back to a bundled sample so the editor still shows something.
 * @returns The file list, the open file and a way to switch files.
 */
export const useDesignoFiles = (): DesignoFiles => {
  const documentSummaries = ref<DocumentSummary[]>([])
  const selectedFileId = ref<string>()
  const activeDocument = ref<DesignDocument>()
  const isDemo = ref(false)
  const lastDocumentJson = ref('')

  const showSample = (): void => {
    const sample = createPaletteDocument()
    isDemo.value = true
    activeDocument.value = sample
    selectedFileId.value = sample.id
    documentSummaries.value = [
      { id: sample.id, name: sample.name, nodeCount: Object.keys(sample.nodes).length }
    ]
  }

  const refresh = async (): Promise<void> => {
    if (isDemo.value) return
    const listResponse = await fetch('/api/files').catch(() => undefined)
    if (!listResponse || !isJsonResponse(listResponse)) {
      showSample()
      return
    }
    documentSummaries.value = documentSummaryListSchema.parse(await listResponse.json())
    selectedFileId.value ??= documentSummaries.value[0]?.id
    if (!selectedFileId.value) return
    const response = await fetch(`/api/files/${encodeURIComponent(selectedFileId.value)}`)
    if (!response.ok) return
    const documentJson = await response.text()
    if (documentJson === lastDocumentJson.value) return
    lastDocumentJson.value = documentJson
    activeDocument.value = storedDocumentSchema.parse(JSON.parse(documentJson))
  }

  const selectFile = (fileId: string): void => {
    selectedFileId.value = fileId
    lastDocumentJson.value = ''
    void refresh()
  }

  const pollTimer = setInterval(() => void refresh(), POLL_INTERVAL_MILLISECONDS)
  onMounted(() => void refresh())
  onBeforeUnmount(() => clearInterval(pollTimer))

  return { documentSummaries, selectedFileId, activeDocument, isDemo, selectFile }
}
