import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasInteractionStore } from './canvasInteraction.ts'
import { useEditorStore } from './editor.ts'
import { useExportStore } from './export.ts'
import { useFilesStore } from './files.ts'
import { useUploadedFontsStore } from './uploadedFonts.ts'
import { disposeWorkspaceStores } from './workspace.ts'

// The stores run without a browser: no text engine to shape with, no canvas to measure on.
vi.mock('../rendering/text/sharedTextEngine.ts', () => ({
  getSharedTextRuntime: () => ({
    engine: { getLayout: () => undefined, subscribe: () => () => undefined }
  })
}))
vi.mock('../rendering/fallbackText.ts', () => ({ measureFallbackTextBox: () => undefined }))

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// With no server answering, the files fall back to the bundled samples.
const openDemo = async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  const files = useFilesStore()
  await vi.waitFor(() => expect(files.isDemo).toBe(true))
  return files
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  disposeWorkspaceStores()
  vi.unstubAllGlobals()
})

describe('files store', () => {
  it('opens the bundled samples when no server answers', async () => {
    const files = await openDemo()
    expect(files.documentSummaries).toHaveLength(3)
    expect(files.activeDocument?.id).toBe(files.selectedFileId)
  })

  it('flags a refused visitor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Sign in' }, 401)))
    const files = useFilesStore()
    await vi.waitFor(() => expect(files.accessRefused).toBe(true))
  })
})

describe('editor store', () => {
  it('applies an edit to the open file and undoes it', async () => {
    const files = await openDemo()
    const editor = useEditorStore()
    const first = Object.values(editor.document?.nodes ?? {}).find((node) => node.name)
    if (!first) throw new Error('The sample has no named node')

    editor.updateNode(first.id, { name: 'Renamed' })
    expect(files.activeDocument?.nodes[first.id]?.name).toBe('Renamed')
    expect(editor.canUndo).toBe(true)

    editor.undo()
    expect(files.activeDocument?.nodes[first.id]?.name).toBe(first.name)
  })

  it('clears the selection when another file opens', async () => {
    const files = await openDemo()
    const editor = useEditorStore()
    const [nodeId] = Object.keys(editor.document?.nodes ?? {})
    editor.select(nodeId ? [nodeId] : [])
    expect(editor.selection).toHaveLength(1)

    const other = files.documentSummaries.find((summary) => summary.id !== files.selectedFileId)
    files.selectFile(other?.id ?? '')
    await vi.waitFor(() => expect(editor.selection).toEqual([]))
  })

  it('pans through setViewport', async () => {
    await openDemo()
    const editor = useEditorStore()
    editor.setViewport({ offsetX: 40, offsetY: -10, scale: 2 })
    expect(editor.viewport).toEqual({ offsetX: 40, offsetY: -10, scale: 2 })
  })
})

describe('workspace stores', () => {
  it('start again empty after the workspace closes', async () => {
    await openDemo()
    useEditorStore().setTool('rectangle')
    useCanvasInteractionStore()
    useExportStore()

    disposeWorkspaceStores()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))

    expect(useFilesStore().documentSummaries).toEqual([])
    expect(useEditorStore().tool).toBe('select')
  })
})

describe('uploaded fonts store', () => {
  it('adds an uploaded font to the list once it is stored', async () => {
    const stored = {
      id: `${'a'.repeat(64)}.ttf`,
      family: 'Studio Sans',
      fontWeight: 400,
      fontStyle: 'normal'
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        Promise.resolve(init?.method === 'POST' ? jsonResponse(stored, 201) : jsonResponse([]))
      )
    )
    const fonts = useUploadedFontsStore()
    const family = await fonts.upload(new File([new Uint8Array([0, 1, 0, 0])], 'studio.ttf'))
    expect(family).toBe('Studio Sans')
    expect(fonts.fonts.map((font) => font.family)).toEqual(['Studio Sans'])
    expect(fonts.isUploading).toBe(false)
  })
})
