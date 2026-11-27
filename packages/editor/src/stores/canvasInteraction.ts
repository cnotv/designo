import { defineStore } from 'pinia'
import { useCanvasInteraction } from '../composables/useCanvasInteraction.ts'
import { useEditorStore } from './editor.ts'

/** What the pointer is doing on the canvas: the running drag, the hover and the cursor. */
export const useCanvasInteractionStore = defineStore('canvasInteraction', () =>
  useCanvasInteraction(useEditorStore())
)
