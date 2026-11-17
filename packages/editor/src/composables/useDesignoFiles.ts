import type { DesignDocument, DesignOperation } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { documentSummaryListSchema, storedDocumentSchema } from '@designo/storage/schemas'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { z } from 'zod'
import { isAccessRefusal } from '../editing/accessGate.ts'
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

const postOperationsRequest = (
  fileId: string,
  operations: readonly DesignOperation[]
): Promise<Response | undefined> =>
  fetch(`/api/files/${encodeURIComponent(fileId)}/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations })
  }).catch(() => undefined)

/**
 * Loads the files from the Designo server, follows changes and saves edits. Without a server,
 * as on a static host, it falls back to a bundled sample that edits stay local to.
 * @param onAccessRefused - Called when the server answers 401 or 403, which means the visitor has
 * signed out or lost access; the app goes back to its sign-in screens rather than failing quietly.
 * @returns The file list, the open file, and ways to switch files and save.
 */
export const useDesignoFiles = (onAccessRefused: () => void): DesignoFiles => {
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

  // A refusal is not an error to show in the editor: the sign-in screens take over.
  const refusedAccess = (response: Response | undefined): boolean => {
    if (!response || !isAccessRefusal(response.status)) return false
    onAccessRefused()
    return true
  }

  // False when this round has nothing more to load: a refusal, the sample, or no files yet.
  const refreshList = async (): Promise<boolean> => {
    const listResponse = await fetch('/api/files').catch(() => undefined)
    if (refusedAccess(listResponse)) return false
    if (!listResponse || !isJsonResponse(listResponse)) {
      showSample()
      return false
    }
    documentSummaries.value = documentSummaryListSchema.parse(await listResponse.json())
    selectedFileId.value ??= documentSummaries.value[0]?.id
    return selectedFileId.value !== undefined
  }

  const refreshOpenFile = async (fileId: string, generationAtStart: number): Promise<void> => {
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`)
    if (refusedAccess(response) || !response.ok) return
    const documentJson = await response.text()
    if (documentJson === lastDocumentJson.value) return
    if (generationAtStart !== localEditGeneration.value) return
    lastDocumentJson.value = documentJson
    activeDocument.value = storedDocumentSchema.parse(JSON.parse(documentJson))
  }

  const refresh = async (): Promise<void> => {
    if (isDemo.value) return
    const generationAtStart = localEditGeneration.value
    const hasOpenFile = await refreshList()
    if (hasOpenFile && selectedFileId.value) {
      await refreshOpenFile(selectedFileId.value, generationAtStart)
    }
  }

  const postOperations = async (
    fileId: string,
    operations: readonly DesignOperation[]
  ): Promise<void> => {
    const response = await postOperationsRequest(fileId, operations)
    if (!response?.ok) {
      // Show the file as the server has it, since this edit did not land.
      lastDocumentJson.value = ''
      if (refusedAccess(response)) return
      saveError.value = response ? await readError(response) : 'The Designo server is not answering'
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
