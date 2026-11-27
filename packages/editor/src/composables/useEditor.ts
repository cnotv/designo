import {
  applyOperations,
  getBooleanOperations,
  getChildren,
  getPageNodes,
  getPaintOrder,
  getTemplateOperations,
  invertOperations,
  type BooleanOperation,
  type DesignDocument,
  type DesignNodePatch,
  type DesignOperation,
  type StationeryTemplate
} from '@designo/core'
import { computed, ref, watch, type Ref } from 'vue'
import { createAlignOperations, createDistributeOperations } from '../editing/alignment.ts'
import { EMPTY_HISTORY, recordHistoryEntry, takeRedo, takeUndo } from '../editing/history.ts'
import {
  copySubtrees,
  createDuplicateOperations,
  createPasteOperations
} from '../editing/clipboard.ts'
import {
  createDetachOperations,
  createInstanceOperations,
  createMakeComponentOperations,
  createResetOverridesOperations
} from '../editing/components.ts'
import { createGroupOperations, createUngroupOperations } from '../editing/grouping.ts'
import {
  createAddPageOperations,
  createDeletePageOperations,
  createMovePageOperations,
  createRenamePageOperations,
  getPageToShowAfterDelete,
  resolveActivePageId,
  showPage
} from '../editing/pages.ts'
import { createLayerOrderOperations } from '../editing/stacking.ts'
import { usePathDraft } from './usePathDraft.ts'
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
  TextBoxMeasurer,
  Tool,
  Viewport
} from '../editing/types.ts'
import {
  fitViewportToContent,
  getContentBounds,
  keepCenterOnResize,
  zoomAt
} from '../editing/viewport.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import type { DesignoFiles, Editor } from './types.ts'
import { useTextEditing } from './useTextEditing.ts'

const FIT_MARGIN = 64

const useViewport = (document: Readonly<Ref<DesignDocument | undefined>>) => {
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

  // A panel shown or hidden resizes the canvas; the content keeps its place in the middle.
  watch(canvasSize, (next, previous) => {
    if (previous.width === 0 || fittedFileId.value === undefined) return
    viewport.value = keepCenterOnResize(viewport.value, previous, next)
  })

  return { viewport, canvasSize, zoomToFit, zoomTo }
}

/**
 * Applies operations to the open document and saves them, without recording a history step.
 * @param document - The open document, replaced on success.
 * @param files - Where the operations are saved.
 * @param operations - The operations to apply.
 * @returns Whether they applied.
 */
export const applyAndSaveOperations = (
  document: Ref<DesignDocument | undefined>,
  files: DesignoFiles,
  operations: readonly DesignOperation[]
): boolean => {
  const current = document.value
  if (!current || operations.length === 0) return false
  const result = applyOperations(current, operations)
  if (!result.ok) return false
  document.value = result.document
  files.saveOperations(operations)
  return true
}

const useHistory = (document: Ref<DesignDocument | undefined>, files: DesignoFiles) => {
  const history = ref<HistoryState>(EMPTY_HISTORY)

  const applyAndSave = (operations: readonly DesignOperation[]): boolean =>
    applyAndSaveOperations(document, files, operations)

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
  | 'combineSelection'
  | 'makeComponent'
  | 'createInstance'
  | 'detachInstance'
  | 'resetOverrides'
  | 'reorderSelection'
  | 'alignSelection'
  | 'distributeSelection'
>

// What the editor does to the selected layers, each a batch committed as one undo step.
const useSelectionActions = (
  document: Readonly<Ref<DesignDocument | undefined>>,
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
    combineSelection: (operation: BooleanOperation) =>
      withDocument((current) => {
        const resultId = createNodeId('path')
        const operations = getBooleanOperations(current, selection.value, operation, resultId)
        commitAndSelect({ operations, selection: operations.length > 0 ? [resultId] : [] })
      }),
    makeComponent: () =>
      withDocument((current) =>
        commitAndSelect(createMakeComponentOperations(current, selection.value))
      ),
    createInstance: () =>
      withDocument((current) =>
        commitAndSelect(
          createInstanceOperations(current, selection.value, createNodeId('instance'))
        )
      ),
    detachInstance: () =>
      withDocument((current) => commitAndSelect(createDetachOperations(current, selection.value))),
    resetOverrides: () =>
      withDocument((current) =>
        commitAndSelect(createResetOverridesOperations(current, selection.value))
      ),
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
 * @param measureTextBox - Sizes a text node's box, which edits keep in step with its words.
 * @returns The editor.
 */
export const useEditor = (files: DesignoFiles, measureTextBox: TextBoxMeasurer): Editor => {
  const wholeDocument = files.activeDocument
  const chosenPageId = ref<string>()
  const activePageId = computed(() =>
    wholeDocument.value ? resolveActivePageId(wholeDocument.value, chosenPageId.value) : ''
  )
  // The rest of the editor reads the shown page as the document's root; edits go to the whole.
  const document = computed(() =>
    wholeDocument.value ? showPage(wholeDocument.value, activePageId.value) : undefined
  )
  const pages = computed(() => (wholeDocument.value ? getPageNodes(wholeDocument.value) : []))
  const selection = ref<string[]>([])
  const tool = ref<Tool>('select')
  const { viewport, canvasSize, zoomToFit, zoomTo } = useViewport(document)
  const { history, commit, undo, redo } = useHistory(wholeDocument, files)
  const { editingText, startTextEdit, commitTextEdit } = useTextEditing(
    document,
    commit,
    measureTextBox
  )

  const selectionActions = useSelectionActions(document, selection, commit)
  const pathDraftActions = usePathDraft(tool, selection, commit)

  const withDocument = (action: (current: DesignDocument) => void): void => {
    if (document.value) action(document.value)
  }

  // The first operation of a page batch creates the page, which is the one to show.
  const addPageAndShow = (operations: readonly DesignOperation[]): void => {
    const [pageOperation] = operations
    if (pageOperation && 'id' in pageOperation && commit(operations)) showPageById(pageOperation.id)
  }

  const showPageById = (pageId: string): void => {
    if (pageId === activePageId.value) return
    chosenPageId.value = pageId
    selection.value = []
    zoomToFit()
  }

  const withWholeDocument = (action: (current: DesignDocument) => void): void => {
    if (wholeDocument.value) action(wholeDocument.value)
  }

  watch(files.selectedFileId, () => {
    chosenPageId.value = undefined
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
    pages,
    activePageId,
    selection,
    tool,
    viewport,
    canvasSize,
    history,
    canUndo: computed(() => history.value.undoStack.length > 0),
    canRedo: computed(() => history.value.redoStack.length > 0),
    commit,
    measureTextBox,
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
    ...pathDraftActions,
    setCanvasSize: (size: { width: number; height: number }) => {
      canvasSize.value = size
    },
    updateNode: (nodeId: string, patch: DesignNodePatch) =>
      withDocument((current) =>
        commit(createPropertyOperations(current, nodeId, patch, measureTextBox))
      ),
    showPage: showPageById,
    addPage: () => addPageAndShow(createAddPageOperations(createNodeId('page'))),
    addPageFromTemplate: (template: StationeryTemplate) =>
      addPageAndShow(getTemplateOperations(template, createNodeId)),
    renamePage: (pageId: string, name: string) =>
      withWholeDocument((current) => commit(createRenamePageOperations(current, pageId, name))),
    movePage: (pageId: string, direction: -1 | 1) =>
      withWholeDocument((current) => commit(createMovePageOperations(current, pageId, direction))),
    deletePage: (pageId: string) =>
      withWholeDocument((current) => {
        const next = getPageToShowAfterDelete(current, pageId)
        if (commit(createDeletePageOperations(current, pageId)) && pageId === activePageId.value) {
          showPageById(next)
        }
      }),
    ...selectionActions,
    selectAll: () =>
      withDocument((current) => {
        selection.value = getChildren(current, current.rootId).map((node) => node.id)
      })
  }
}
