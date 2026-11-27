import { defineStore } from 'pinia'
import { useEditor } from '../composables/useEditor.ts'
import { useTextBoxFitting } from '../composables/useTextBoxFitting.ts'
import { measureFallbackTextBox } from '../rendering/fallbackText.ts'
import { getSharedTextRuntime } from '../rendering/text/sharedTextEngine.ts'
import { createTextBoxMeasurer } from '../rendering/text/textBoxMeasurer.ts'
import { useFilesStore } from './files.ts'

/** The open page, the selection, the tool, the view and the undo history. */
export const useEditorStore = defineStore('editor', () => {
  const files = useFilesStore()
  const { engine } = getSharedTextRuntime()
  useTextBoxFitting(files, engine)
  return useEditor(files, createTextBoxMeasurer(engine, measureFallbackTextBox))
})
