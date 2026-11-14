import {
  applyOperations,
  getChildren,
  getPaintOrder,
  invertOperations,
  type DesignDocument,
  type DesignNodePatch,
  type DesignOperation
} from '@designo/core'
import { computed, ref, watch, type Ref } from 'vue'
import { createAlignOperations, createDistributeOperations } from '../editing/alignment.ts'
import { EMPTY_HISTORY, recordHistoryEntry, takeRedo, takeUndo } from '../editing/history.ts'
import {
  copySubtrees,
  createDuplicateOperations,
  createPasteOperations
} from '../editing/clipboard.ts'
import { createGroupOperations, createUngroupOperations } from '../editing/grouping.ts'
import { createLayerOrderOperations } from '../editing/stacking.ts'
import {
  createDeleteOperations,
  createMoveOperations,
  createPropertyOperations
} from '../editing/operations.ts'
import type {
  AlignKind,
  ClipboardContent,
  CreatedNodes,
  DistributeAxis,
  HistoryState,
  LayerOrderMode,
  SelectionChange,
  Tool,
  Viewport
} from '../editing/types.ts'
import { fitViewportToContent, getContentBounds, zoomAt } from '../editing/viewport.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import type { DesignoFiles, Editor } from './types.ts'
import { useTextEditing } from './useTextEditing.ts'

const FIT_MARGIN = 64

const useViewport = (document: Ref<DesignDocument | undefined>) => {
  const viewport = ref<Viewport>({ offsetX: 0, offsetY: 0, scale: 1 })
  const canvasSize = ref({ width: 0, height: 0 })
  const fittedFileId = ref<string>()

  const zoomToFit = (): void => {
    if (!document.value) return
    viewport.value = fitViewportToContent(
      getContentBounds(getPaintOrder(document.value)),
      canvasSize.value.width,
      canvasSize.value.height,
      FIT_MARGIN
    )
  }

  const zoomTo = (scale: number): void => {
    const center = { x: canvasSize.value.width / 2, y: canvasSize.value.height / 2 }
    viewport.value = zoomAt(viewport.value, center, scale / viewport.value.scale)
  }

  // Each file is fitted the first time it shows up, once the canvas knows its size.
  watch([document, canvasSize], () => {
    const fileId = document.value?.id
    if (!fileId || fittedFileId.value === fileId || canvasSize.value.width === 0) return
    fittedFileId.value = fileId
    zoomToFit()
  })

  return { viewport, canvasSize, zoomToFit, zoomTo }
}

const useHistory = (document: Ref<DesignDocument | undefined>, files: DesignoFiles) => {
  const history = ref<HistoryState>(EMPTY_HISTORY)

  const applyAndSave = (operations: readonly DesignOperation[]): boolean => {
    const current = document.value
    if (!current || operations.length === 0) return false
    const result = applyOperations(current, operations)
    if (!result.ok) return false
    document.value = result.document
    files.saveOperations(operations)
    return true
  }

  const commit = (operations: readonly DesignOperation[]): boolean => {
    const before = document.value
    if (!before || !applyAndSave(operations)) return false
    const backward = invertOperations(before, operations)
    history.value = recordHistoryEntry(history.value, { forward: operations, backward })
    return true
  }

  // An agent may have changed the file since a step was taken; a step that no longer applies is
  // dropped rather than half-applied.
  const undo = (): void => {
    const taken = takeUndo(history.value)
    if (!taken) return
    history.value = taken.history
    applyAndSave(taken.entry.backward)
  }

  const redo = (): void => {
    const taken = takeRedo(history.value)
    if (!taken) return
    history.value = taken.history
    applyAndSave(taken.entry.forward)
  }

  return { history, commit, undo, redo }
}

interface ClipboardState {
  content: ClipboardContent
  pasteCount: number
}

// The system clipboard is a courtesy for pasting elsewhere; the in-app one is what paste reads.
const writeSystemClipboard = (content: ClipboardContent): void => {
  navigator.clipboard?.writeText(JSON.stringify(content.nodes)).catch(() => undefined)
}

type SelectionActions = Pick<
  Editor,
  | 'deleteSelection'
  | 'nudgeSelection'
  | 'duplicateSelection'
  | 'copySelection'
  | 'cutSelection'
  | 'paste'
  | 'groupSelection'
  | 'ungroupSelection'
  | 'reorderSelection'
  | 'alignSelection'
  | 'distributeSelection'
>

// What the editor does to the selected layers, each a batch committed as one undo step.
const useSelectionActions = (
  document: Ref<DesignDocument | undefined>,
  selection: Ref<string[]>,
  commit: Editor['commit']
): SelectionActions => {
  const clipboard = ref<ClipboardState>()

  const withDocument = (action: (current: DesignDocument) => void): void => {
    if (document.value) action(document.value)
  }

  const commitAndSelect = (change: CreatedNodes | SelectionChange): void => {
    if (!commit(change.operations)) return
    selection.value = 'rootIds' in change ? change.rootIds : change.selection
  }

  const copySelection = (): ClipboardContent | undefined => {
    const content = document.value && copySubtrees(document.value, selection.value)
    if (!content) return undefined
    clipboard.value = { content, pasteCount: 0 }
    writeSystemClipboard(content)
    return content
  }

  const deleteSelection = (): void =>
    withDocument((current) => {
      commit(createDeleteOperations(current, selection.value))
      selection.value = []
    })

  return {
    deleteSelection,
    nudgeSelection: (deltaX: number, deltaY: number) =>
      withDocument((current) =>
        commit(createMoveOperations(current, selection.value, deltaX, deltaY))
      ),
    duplicateSelection: () =>
      withDocument((current) =>
        commitAndSelect(createDuplicateOperations(current, selection.value, createNodeId))
      ),
    copySelection: () => {
      copySelection()
    },
    cutSelection: () => {
      if (copySelection()) deleteSelection()
    },
    paste: () =>
      withDocument((current) => {
        const held = clipboard.value
        if (!held) return
        commitAndSelect(createPasteOperations(current, held.content, held.pasteCount, createNodeId))
        clipboard.value = { ...held, pasteCount: held.pasteCount + 1 }
      }),
    groupSelection: () =>
      withDocument((current) =>
        commitAndSelect(createGroupOperations(current, selection.value, createNodeId('group')))
      ),
    ungroupSelection: () =>
      withDocument((current) => commitAndSelect(createUngroupOperations(current, selection.value))),
    reorderSelection: (mode: LayerOrderMode) =>
      withDocument((current) => commit(createLayerOrderOperations(current, selection.value, mode))),
    alignSelection: (kind: AlignKind) =>
      withDocument((current) => commit(createAlignOperations(current, selection.value, kind))),
    distributeSelection: (axis: DistributeAxis) =>
      withDocument((current) => commit(createDistributeOperations(current, selection.value, axis)))
  }
}

/**
 * Holds the editing state for the open file: selection, tool, viewport and history. Every change
 * goes through `commit`, which applies it locally, records its inverse for undo and saves it.
 * @param files - The open file and how to save it.
 * @returns The editor.
 */
export const useEditor = (files: DesignoFiles): Editor => {
  const document = files.activeDocument
  const selection = ref<string[]>([])
  const tool = ref<Tool>('select')
  const { viewport, canvasSize, zoomToFit, zoomTo } = useViewport(document)
  const { history, commit, undo, redo } = useHistory(document, files)
  const { editingText, startTextEdit, commitTextEdit } = useTextEditing(document, commit)

  const selectionActions = useSelectionActions(document, selection, commit)

  const withDocument = (action: (current: DesignDocument) => void): void => {
    if (document.value) action(document.value)
  }

  watch(files.selectedFileId, () => {
    selection.value = []
    history.value = EMPTY_HISTORY
  })

  // Nodes an agent or an undo removed drop out of the selection.
  watch(document, (current) => {
    const remaining = selection.value.filter((nodeId) => current?.nodes[nodeId])
    if (remaining.length !== selection.value.length) selection.value = remaining
  })

  return {
    document,
    selection,
    tool,
    viewport,
    canvasSize,
    history,
    canUndo: computed(() => history.value.undoStack.length > 0),
    canRedo: computed(() => history.value.redoStack.length > 0),
    commit,
    editingText,
    startTextEdit,
    commitTextEdit,
    undo,
    redo,
    zoomToFit,
    zoomTo,
    select: (nodeIds: readonly string[]) => {
      selection.value = [...nodeIds]
    },
    setTool: (next: Tool) => {
      tool.value = next
    },
    setCanvasSize: (size: { width: number; height: number }) => {
      canvasSize.value = size
    },
    updateNode: (nodeId: string, patch: DesignNodePatch) =>
      withDocument((current) => commit(createPropertyOperations(current, nodeId, patch))),
    ...selectionActions,
    selectAll: () =>
      withDocument((current) => {
        selection.value = getChildren(current, current.rootId).map((node) => node.id)
      })
  }
}
