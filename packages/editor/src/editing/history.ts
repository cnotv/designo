import type { HistoryEntry, HistoryState } from './types.ts'

const MAX_HISTORY_ENTRIES = 200

export const EMPTY_HISTORY: HistoryState = { undoStack: [], redoStack: [] }

/**
 * Records a new step. A new step makes the redo stack meaningless, so it is cleared.
 * @param history - The history so far.
 * @param entry - The step just taken.
 * @returns The new history, keeping the latest 200 steps.
 */
export const recordHistoryEntry = (history: HistoryState, entry: HistoryEntry): HistoryState => ({
  undoStack: [...history.undoStack, entry].slice(-MAX_HISTORY_ENTRIES),
  redoStack: []
})

/**
 * Takes the latest step off the undo stack and moves it to the redo stack.
 * @param history - The history so far.
 * @returns The step to undo and the new history, or undefined when there is nothing to undo.
 */
export const takeUndo = (
  history: HistoryState
): { entry: HistoryEntry; history: HistoryState } | undefined => {
  const entry = history.undoStack.at(-1)
  if (!entry) return undefined
  return {
    entry,
    history: { undoStack: history.undoStack.slice(0, -1), redoStack: [...history.redoStack, entry] }
  }
}

/**
 * Takes the latest undone step off the redo stack and moves it back to the undo stack.
 * @param history - The history so far.
 * @returns The step to redo and the new history, or undefined when there is nothing to redo.
 */
export const takeRedo = (
  history: HistoryState
): { entry: HistoryEntry; history: HistoryState } | undefined => {
  const entry = history.redoStack.at(-1)
  if (!entry) return undefined
  return {
    entry,
    history: { undoStack: [...history.undoStack, entry], redoStack: history.redoStack.slice(0, -1) }
  }
}
