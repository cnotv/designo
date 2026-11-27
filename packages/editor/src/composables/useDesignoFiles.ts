import type { DesignDocument, DesignOperation } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import { documentSummaryListSchema, storedDocumentSchema } from '@designo/storage/schemas'
import { onScopeDispose, ref, type Ref } from 'vue'
import { z } from 'zod'
import { isAccessRefusal } from '../editing/accessGate.ts'
import { createDemoFiles } from './demoFiles.ts'
import type { DesignoFiles } from './types.ts'

// Polling keeps the loop simple until the Yjs sync server lands; MCP edits show within a second.
const POLL_INTERVAL_MILLISECONDS = 1000

const errorBodySchema = z.object({ error: z.string() })

const isJsonResponse = (response: Response): boolean =>
  response.ok && (response.headers.get('Content-Type') ?? '').includes('application/json')

const readError = async (response: Response): Promise<string> => {
  const body: unknown = await response.json().catch(() => undefined)
  const parsed = errorBodySchema.safeParse(body)
  return parsed.success ? parsed.data.error : `Request failed (${response.status})`
}

const deleteFileRequest = (fileId: string): Promise<Response | undefined> =>
  fetch(`/api/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }).catch(() => undefined)

const failureMessage = (response: Response | undefined): Promise<string> =>
  response ? readError(response) : Promise.resolve('The Designo server is not answering')

const postOperationsRequest = (
  fileId: string,
  operations: readonly DesignOperation[]
): Promise<Response | undefined> =>
  fetch(`/api/files/${encodeURIComponent(fileId)}/operations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations })
  }).catch(() => undefined)

// Loads now and polls until the store is disposed; a poll waits for the saves before it.
const followServer = (refresh: () => Promise<void>, pendingSave: Ref<Promise<void>>): void => {
  const pollTimer = setInterval(() => {
    void pendingSave.value.then(refresh)
  }, POLL_INTERVAL_MILLISECONDS)
  onScopeDispose(() => clearInterval(pollTimer))
  void refresh()
}

/**
 * Loads the files from the Designo server, follows changes and saves edits. Without a server,
 * as on a static host, it falls back to a bundled sample that edits stay local to.
 * It is the files store's setup, so it starts loading at once and stops when the store is disposed.
 * @returns The file list, the open file, and ways to switch files and save. `accessRefused` turns
 * true when the server answers 401 or 403, which means the visitor has signed out or lost access;
 * the app goes back to its sign-in screens rather than failing quietly.
 */
export const useDesignoFiles = (): DesignoFiles => {
  const documentSummaries = ref<DocumentSummary[]>([])
  const selectedFileId = ref<string>()
  const activeDocument = ref<DesignDocument>()
  const isDemo = ref(false)
  const saveError = ref<string>()
  const accessRefused = ref(false)
  const lastDocumentJson = ref('')
  // Bumped by every local edit: a poll that started before an edit would show the file without it.
  const localEditGeneration = ref(0)
  const pendingSave = ref<Promise<void>>(Promise.resolve())

  const demo = createDemoFiles({ documentSummaries, selectedFileId, activeDocument })
  // A refusal is not an error to show in the editor: the sign-in screens take over.
  const refusedAccess = (response: Response | undefined): boolean => {
    if (!response || !isAccessRefusal(response.status)) return false
    accessRefused.value = true
    return true
  }

  // False when this round has nothing more to load: a refusal, the sample, or no files yet.
  const refreshList = async (): Promise<boolean> => {
    const listResponse = await fetch('/api/files').catch(() => undefined)
    if (refusedAccess(listResponse)) return false
    if (!listResponse || !isJsonResponse(listResponse)) {
      isDemo.value = true
      demo.start()
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
      saveError.value = await failureMessage(response)
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
    if (isDemo.value) demo.select(fileId)
    else {
      selectedFileId.value = fileId
      lastDocumentJson.value = ''
      void refresh()
    }
  }

  // The file goes from the server first, so a failed delete leaves the list as it was.
  const deleteFile = async (fileId: string): Promise<void> => {
    const response = isDemo.value ? undefined : await deleteFileRequest(fileId)
    if (isDemo.value) demo.remove(fileId)
    if (isDemo.value || refusedAccess(response)) return
    saveError.value = response?.ok ? undefined : await failureMessage(response)
    if (!response?.ok) return
    if (selectedFileId.value === fileId) {
      selectedFileId.value = undefined
      activeDocument.value = undefined
    }
    await refresh()
  }

  followServer(refresh, pendingSave)

  return {
    documentSummaries,
    selectedFileId,
    activeDocument,
    isDemo,
    saveError,
    accessRefused,
    reportError: (message: string) => {
      saveError.value = message
    },
    selectFile,
    deleteFile,
    saveOperations
  }
}
