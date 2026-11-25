import { onScopeDispose, watch } from 'vue'
import type { TextEngine } from '@designo/text'
import { findStaleTextBoxes } from '../editing/textRefit.ts'
import { applyAndSaveOperations } from './useEditor.ts'
import type { DesignoFiles } from './types.ts'

/**
 * Keeps every auto width text the size it is drawn at: when a file loads, whenever it changes,
 * and as each font arrives, since a text made without the fonts keeps an estimated box. A fit
 * corrects a box to what is drawn, so it records no step to undo.
 * @param files - The open file and how to save it.
 * @param engine - The engine the canvas draws with.
 */
export const useTextBoxFitting = (
  files: DesignoFiles,
  engine: Pick<TextEngine, 'getLayout' | 'subscribe'>
): void => {
  const fitTextBoxes = (): void => {
    const document = files.activeDocument.value
    if (!document) return
    applyAndSaveOperations(
      files.activeDocument,
      files,
      findStaleTextBoxes(document, engine.getLayout)
    )
  }
  watch(files.activeDocument, fitTextBoxes, { immediate: true })
  onScopeDispose(engine.subscribe(fitTextBoxes))
}
