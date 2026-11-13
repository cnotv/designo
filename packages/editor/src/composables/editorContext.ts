import { inject, provide, type InjectionKey } from 'vue'
import type { CanvasInteraction, DesignoFiles, Editor, ExportController } from './types.ts'

interface EditorContext {
  files: DesignoFiles
  editor: Editor
  interaction: CanvasInteraction
  exporter: ExportController
}

const EDITOR_CONTEXT: InjectionKey<EditorContext> = Symbol('designo-editor')

/**
 * Shares the editor with every panel below the app. Panels change the editor's state, which Vue
 * forbids through props, so it travels by provide and inject instead.
 * @param context - The files, editor, canvas interaction and exporter.
 */
export const provideEditorContext = (context: EditorContext): void => {
  provide(EDITOR_CONTEXT, context)
}

/**
 * Reads the editor shared by the app.
 * @returns The files, editor and canvas interaction.
 */
export const useEditorContext = (): EditorContext => {
  const context = inject(EDITOR_CONTEXT)
  if (!context) throw new Error('useEditorContext needs provideEditorContext higher up')
  return context
}
