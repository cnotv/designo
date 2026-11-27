import { watch, ref, type ComputedRef, type Ref } from 'vue'
import type { DesignDocument } from '@designo/core'
import {
  createAddAnchorOperations,
  createBakeRotationOperations,
  createRemoveAnchorOperations,
  createToggleAnchorOperations,
  PATH_GRAB_RADIUS_PX
} from '../editing/pathEditing.ts'
import type { PathEditSession, Point, Tool } from '../editing/types.ts'
import type { Editor } from './types.ts'
import { usePathDraft } from './usePathDraft.ts'

type PathEditActions = Pick<
  Editor,
  | 'pathEdit'
  | 'startPathEdit'
  | 'stopPathEdit'
  | 'selectPathAnchor'
  | 'removePathAnchor'
  | 'togglePathAnchor'
  | 'addPathAnchor'
>

/**
 * Holds the path whose anchors and bezier handles are shown for editing. Dragging them is the
 * canvas's; this keeps the session, ends it when the path is no longer the selection, and makes
 * the edits that are a click rather than a drag.
 * @param document - The shown document.
 * @param selection - The selection; leaving the path ends the session.
 * @param commit - Applies a batch to the document.
 * @returns The session and what is done to it.
 */
export const usePathEdit = (
  document: ComputedRef<DesignDocument | undefined>,
  selection: Ref<string[]>,
  commit: Editor['commit']
): PathEditActions => {
  const pathEdit = ref<PathEditSession>()

  const stopPathEdit = (): void => {
    pathEdit.value = undefined
  }

  const editedNode = () => {
    const session = pathEdit.value
    return session ? document.value?.nodes[session.nodeId] : undefined
  }

  // The session follows the selection and the node: another selection, an undo that removes the
  // path, or an agent deleting it all end the edit.
  watch([selection, document], () => {
    const session = pathEdit.value
    if (!session) return
    const stillSelected = selection.value.length === 1 && selection.value[0] === session.nodeId
    if (!stillSelected || !document.value?.nodes[session.nodeId]) stopPathEdit()
  })

  // Removing or adding an anchor refits the node, and may delete it when too little is left.
  const commitEdit = (operations: Parameters<Editor['commit']>[0]): boolean =>
    operations.length > 0 && commit(operations)

  return {
    pathEdit,
    stopPathEdit,
    startPathEdit: (nodeId: string) => {
      const node = document.value?.nodes[nodeId]
      if (node?.type !== 'path') return
      // A turned path is edited in the page's own axes, so the turn is baked into the outline.
      if (!commitEdit(createBakeRotationOperations(node)) && node.rotation !== 0) return
      selection.value = [nodeId]
      pathEdit.value = { nodeId, selected: undefined }
    },
    selectPathAnchor: (selected) => {
      if (pathEdit.value) pathEdit.value = { ...pathEdit.value, selected }
    },
    removePathAnchor: () => {
      const node = editedNode()
      const selected = pathEdit.value?.selected
      if (!node || !selected) return
      if (commitEdit(createRemoveAnchorOperations(node, selected)) && pathEdit.value) {
        pathEdit.value = { ...pathEdit.value, selected: undefined }
      }
    },
    togglePathAnchor: (address) => {
      const node = editedNode()
      if (node) commitEdit(createToggleAnchorOperations(node, address))
    },
    addPathAnchor: (world: Point, scale: number) => {
      const node = editedNode()
      const added = node && createAddAnchorOperations(node, world, PATH_GRAB_RADIUS_PX / scale)
      if (!added || !commitEdit(added.operations) || !pathEdit.value) return
      pathEdit.value = { ...pathEdit.value, selected: added.target }
    }
  }
}

/**
 * The path tools' state together: the path being drawn and the path being edited.
 * @param document - The shown document.
 * @param tool - The editor's tool.
 * @param selection - The selection.
 * @param commit - Applies a batch to the document.
 * @returns Both sets of actions.
 */
export const usePathActions = (
  document: ComputedRef<DesignDocument | undefined>,
  tool: Ref<Tool>,
  selection: Ref<string[]>,
  commit: Editor['commit']
) => ({
  ...usePathDraft(tool, selection, commit),
  ...usePathEdit(document, selection, commit)
})
