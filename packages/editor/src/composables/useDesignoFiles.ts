import type { DesignDocument, DesignOperation } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { documentSummaryListSchema, storedDocumentSchema } from '@designo/storage/schemas'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { z } from 'zod'
import { createPaletteDocument } from '../samples/paletteDocument.ts'
import type { DesignoFiles } from './types.ts'

// Polling keeps the loop simple until the Yjs sync server lands; MCP edits show within a second.
const POLL_INTERVAL_MILLISECONDS = 1000

const errorBodySchema = z.object({ error: z.string() })

const isJsonResponse = (response: Response): boolean =>
  response.ok && (response.headers.get('Content-Type') ?? '').includes('application/json')

const readError = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => undefined)
  const parsed = errorBodySchema.safeParse(body)
  return parsed.success ? parsed.data.error : `Saving failed (${response.status})`
}

/**
 * Loads the files from the Designo server, follows changes and saves edits. Without a server,
 * as on a static host, it falls back to a bundled sample that edits stay local to.
 * @returns The file list, the open file, and ways to switch files and save.
 */
export const useDesignoFiles = (): DesignoFiles => {
  const documentSummaries = ref<DocumentSummary[]>([])
  const selectedFileId = ref<string>()
  const activeDocument = ref<DesignDocument>()
  const isDemo = ref(false)
  const saveError = ref<string>()
  const lastDocumentJson = ref('')
  // Bumped by every local edit: a poll that started before an edit would show the file without it.
  const localEditGeneration = ref(0)
  const pendingSave = ref<Promise<void>>(Promise.resolve())

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
    const generationAtStart = localEditGeneration.value
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
    if (generationAtStart !== localEditGeneration.value) return
    lastDocumentJson.value = documentJson
    activeDocument.value = storedDocumentSchema.parse(JSON.parse(documentJson))
  }

  const postOperations = async (
    fileId: string,
    operations: readonly DesignOperation[]
  ): Promise<void> => {
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations })
    }).catch(() => undefined)
    if (!response?.ok) {
      saveError.value = response ? await readError(response) : 'The Designo server is not answering'
      // Show the file as the server has it, since this edit did not land.
      lastDocumentJson.value = ''
      return
    }
    saveError.value = undefined
  }

  // Saves run one after another so the server applies batches in the order they were made.
  const saveOperations = (operations: readonly DesignOperation[]): void => {
    localEditGeneration.value += 1
    const fileId = selectedFileId.value
    if (isDemo.value || !fileId) return
    pendingSave.value = pendingSave.value.then(() => postOperations(fileId, operations))
  }

  const selectFile = (fileId: string): void => {
    selectedFileId.value = fileId
    lastDocumentJson.value = ''
    void refresh()
  }

  const pollTimer = setInterval(() => {
    void pendingSave.value.then(refresh)
  }, POLL_INTERVAL_MILLISECONDS)
  onMounted(() => void refresh())
  onBeforeUnmount(() => clearInterval(pollTimer))

  return {
    documentSummaries,
    selectedFileId,
    activeDocument,
    isDemo,
    saveError,
    selectFile,
    saveOperations
  }
}
