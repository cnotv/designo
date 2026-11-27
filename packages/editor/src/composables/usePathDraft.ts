import { ref, type Ref } from 'vue'
import {
  createPathDraftOperation,
  isNearFirstPoint,
  isPathTool,
  removeRepeatedPoints
} from '../editing/pathTools.ts'
import type { PathDraft, Point, Tool } from '../editing/types.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import type { Editor } from './types.ts'

const MIN_POINTS_OPEN = 2
const MIN_POINTS_CLOSED = 3

type PathDraftActions = Pick<
  Editor,
  | 'pathDraft'
  | 'addPathPoint'
  | 'setPathPointHandle'
  | 'finishPathDraft'
  | 'cancelPathDraft'
  | 'setTool'
>

/**
 * Holds the path the pen or polygon tool is drawing, which is only committed, as one create and
 * so one undo step, when the path is finished.
 * @param tool - The editor's tool, which says what the clicks draw; it goes back to select once a
 * path is finished.
 * @param selection - The selection, which becomes the finished path.
 * @param commit - Applies a batch to the document.
 * @returns The draft, what the canvas and shortcuts do to it, and the tool switch that keeps a
 * path in progress.
 */
export const usePathDraft = (
  tool: Ref<Tool>,
  selection: Ref<string[]>,
  commit: Editor['commit']
): PathDraftActions => {
  const pathDraft = ref<PathDraft>()

  const finishPathDraft = (closed?: boolean): void => {
    const placed = pathDraft.value
    pathDraft.value = undefined
    if (!placed) return
    const draft = { ...placed, points: removeRepeatedPoints(placed.points) }
    const isClosed = closed ?? draft.tool === 'polygon'
    const needed = isClosed ? MIN_POINTS_CLOSED : MIN_POINTS_OPEN
    if (draft.points.length < needed) return
    if (!commit([createPathDraftOperation(draft, { closed: isClosed })])) return
    selection.value = [draft.nodeId]
    tool.value = 'select'
  }

  return {
    pathDraft,
    finishPathDraft,
    // Leaving the pen mid-path keeps what was drawn, as other editors do.
    setTool: (next: Tool) => {
      finishPathDraft()
      tool.value = next
    },
    cancelPathDraft: () => {
      pathDraft.value = undefined
    },
    addPathPoint: (point: Point, parentId: string, scale: number) => {
      const draft = pathDraft.value
      if (!draft) {
        if (!isPathTool(tool.value)) return
        pathDraft.value = {
          tool: tool.value,
          nodeId: createNodeId('path'),
          parentId,
          points: [point]
        }
        return
      }
      if (isNearFirstPoint(draft.points, point, scale)) {
        finishPathDraft(true)
        return
      }
      pathDraft.value = { ...draft, points: [...draft.points, point] }
    },
    setPathPointHandle: (handleOut: Point) => {
      const draft = pathDraft.value
      const last = draft?.points.at(-1)
      if (!draft || !last) return
      pathDraft.value = { ...draft, points: [...draft.points.slice(0, -1), { ...last, handleOut }] }
    }
  }
}
