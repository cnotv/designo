import { onScopeDispose, toRef, watch } from 'vue'
import type { TextEngine } from '@designo/text'
import { findStaleTextBoxes } from '../editing/textRefit.ts'
import { applyAndSaveOperations } from './useEditor.ts'
import type { FilesStore } from '../stores/types.ts'

/**
 * Keeps every auto width text the size it is drawn at: when a file loads, whenever it changes,
 * and as each font arrives, since a text made without the fonts keeps an estimated box. A fit
 * corrects a box to what is drawn, so it records no step to undo.
 * @param files - The open file and how to save it.
 * @param engine - The engine the canvas draws with.
 */
export const useTextBoxFitting = (
  files: FilesStore,
  engine: Pick<TextEngine, 'getLayout' | 'subscribe'>
): void => {
  const activeDocument = toRef(files, 'activeDocument')
  const fitTextBoxes = (): void => {
    const document = activeDocument.value
    if (!document) return
    applyAndSaveOperations(activeDocument, files, findStaleTextBoxes(document, engine.getLayout))
  }
  watch(activeDocument, fitTextBoxes, { immediate: true })
  onScopeDispose(engine.subscribe(fitTextBoxes))
}
