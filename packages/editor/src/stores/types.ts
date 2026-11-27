import type { useCanvasInteractionStore } from './canvasInteraction.ts'
import type { useEditorStore } from './editor.ts'
import type { useExportStore } from './export.ts'
import type { useFilesStore } from './files.ts'

export type FilesStore = ReturnType<typeof useFilesStore>
export type EditorStore = ReturnType<typeof useEditorStore>
export type CanvasInteractionStore = ReturnType<typeof useCanvasInteractionStore>
export type ExportStore = ReturnType<typeof useExportStore>
