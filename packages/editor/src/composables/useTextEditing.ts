import type { DesignDocument, DesignOperation } from '@designo/core'
import { ref, watch, type Ref } from 'vue'
import { createTextCommitOperations } from '../editing/textEditing.ts'
import type { TextEditSession } from '../editing/types.ts'

/**
 * Tracks which text node is being edited in place and ends the edit as one undoable step.
 * @param document - The open document.
 * @param commit - Applies, records and saves a batch of operations.
 * @returns The running edit and how to start and end it.
 */
export const useTextEditing = (
  document: Ref<DesignDocument | undefined>,
  commit: (operations: readonly DesignOperation[]) => boolean
) => {
  const editingText = ref<TextEditSession>()

  // A node an agent or an undo removed, or another file, ends the edit without a commit.
  watch(document, (current) => {
    const session = editingText.value
    if (session && !current?.nodes[session.nodeId]) editingText.value = undefined
  })

  const startTextEdit = (nodeId: string, isNew: boolean): void => {
    editingText.value = { nodeId, isNew }
  }

  const commitTextEdit = (draftText: string): void => {
    const session = editingText.value
    const current = document.value
    editingText.value = undefined
    if (!session || !current) return
    commit(createTextCommitOperations(current, session, draftText))
  }

  return { editingText, startTextEdit, commitTextEdit }
}
