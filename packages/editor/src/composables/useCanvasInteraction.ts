import { applyOperations, type DesignDocument, type DesignOperation } from '@designo/core'
import { computed, ref, type Ref } from 'vue'
import { boundsFromPoints, getHandlePositions, getNodeBounds } from '../editing/geometry.ts'
import {
  createDrawOperation,
  createMoveOperations,
  createResizeOperations
} from '../editing/operations.ts'
import {
  findContainerAtPoint,
  findNodeAtPoint,
  findNodesInBounds,
  toggleInSelection
} from '../editing/selection.ts'
import type { Bounds, Interaction, Point, ResizeHandle } from '../editing/types.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import { panBy, screenToWorld, worldToScreen, zoomAt } from '../editing/viewport.ts'
import type { CanvasInteraction, Editor } from './types.ts'

const HANDLE_HIT_RADIUS = 6
const WHEEL_ZOOM_SPEED = 0.002
const MIDDLE_BUTTON = 1
const SECONDARY_BUTTON = 2

const CURSOR_BY_HANDLE: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
}

interface HandleHit {
  handle: ResizeHandle
  nodeId: string
  bounds: Bounds
}

const pointerOnCanvas = (event: MouseEvent): Point => {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

// Every drag but a pan follows the pointer in world units.
const followPointer = (state: Interaction, world: Point): Interaction =>
  state.kind === 'idle' || state.kind === 'panning' ? state : { ...state, currentWorld: world }

const difference = (from: Point, to: Point): Point => ({ x: to.x - from.x, y: to.y - from.y })

const previewOperations = (
  document: DesignDocument,
  state: Interaction,
  keepSquare: boolean
): DesignOperation[] => {
  if (state.kind === 'moving') {
    const delta = difference(state.startWorld, state.currentWorld)
    return createMoveOperations(document, state.nodeIds, delta.x, delta.y)
  }
  if (state.kind === 'resizing') {
    const delta = difference(state.startWorld, state.currentWorld)
    return createResizeOperations(state.nodeId, state.startBounds, state.handle, delta)
  }
  if (state.kind === 'drawing') {
    const { tool, nodeId, parentId, startWorld: start, currentWorld: current } = state
    return [createDrawOperation({ tool, nodeId, parentId, start, current, keepSquare })]
  }
  return []
}

const findHandleAt = (editor: Editor, screenPoint: Point): HandleHit | undefined => {
  const [nodeId] = editor.selection.value
  const single = editor.selection.value.length === 1 && nodeId
  const node = single ? editor.document.value?.nodes[nodeId] : undefined
  if (!node) return undefined
  const bounds = getNodeBounds(node)
  const hit = getHandlePositions(bounds).find(({ point }) => {
    const onScreen = worldToScreen(editor.viewport.value, point)
    return (
      Math.abs(onScreen.x - screenPoint.x) <= HANDLE_HIT_RADIUS &&
      Math.abs(onScreen.y - screenPoint.y) <= HANDLE_HIT_RADIUS
    )
  })
  return hit ? { handle: hit.handle, nodeId: node.id, bounds } : undefined
}

const startSelectToolDrag = (
  editor: Editor,
  document: DesignDocument,
  event: PointerEvent,
  world: Point
): Interaction => {
  const handle = findHandleAt(editor, pointerOnCanvas(event))
  if (handle) {
    const { nodeId, bounds: startBounds } = handle
    return {
      kind: 'resizing',
      nodeId,
      handle: handle.handle,
      startBounds,
      startWorld: world,
      currentWorld: world
    }
  }
  const hit = findNodeAtPoint(document, world)
  if (!hit) {
    const baseSelection = event.shiftKey ? editor.selection.value : []
    editor.select(baseSelection)
    return { kind: 'marquee', startWorld: world, currentWorld: world, baseSelection }
  }
  if (event.shiftKey) {
    editor.select(toggleInSelection(editor.selection.value, hit.id))
    return { kind: 'idle' }
  }
  if (!editor.selection.value.includes(hit.id)) editor.select([hit.id])
  const nodeIds = [...editor.selection.value]
  return { kind: 'moving', nodeIds, startWorld: world, currentWorld: world }
}

const startDrag = (
  editor: Editor,
  document: DesignDocument,
  event: PointerEvent,
  spaceHeld: boolean
): Interaction => {
  const screen = pointerOnCanvas(event)
  const world = screenToWorld(editor.viewport.value, screen)
  if (event.button === MIDDLE_BUTTON || spaceHeld) {
    return { kind: 'panning', startScreen: screen, startViewport: editor.viewport.value }
  }
  const tool = editor.tool.value
  if (tool === 'select') return startSelectToolDrag(editor, document, event, world)
  const parentId = findContainerAtPoint(document, world)
  const nodeId = createNodeId(tool)
  return { kind: 'drawing', tool, nodeId, parentId, startWorld: world, currentWorld: world }
}

const pickCursor = (
  editor: Editor,
  state: Interaction,
  spaceHeld: boolean,
  hoveredHandle: ResizeHandle | undefined
): string => {
  if (state.kind === 'panning') return 'grabbing'
  if (spaceHeld) return 'grab'
  if (editor.tool.value !== 'select') return 'crosshair'
  if (state.kind === 'resizing') return CURSOR_BY_HANDLE[state.handle]
  return hoveredHandle ? CURSOR_BY_HANDLE[hoveredHandle] : 'default'
}

const usePreview = (editor: Editor, interaction: Ref<Interaction>, shiftHeld: Ref<boolean>) =>
  computed(() => {
    const document = editor.document.value
    if (!document) return undefined
    const operations = previewOperations(document, interaction.value, shiftHeld.value)
    if (operations.length === 0) return document
    const result = applyOperations(document, operations)
    return result.ok ? result.document : document
  })

const zoomOrPan = (editor: Editor, event: WheelEvent): void => {
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) {
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED)
    editor.viewport.value = zoomAt(editor.viewport.value, pointerOnCanvas(event), factor)
    return
  }
  editor.viewport.value = panBy(editor.viewport.value, -event.deltaX, -event.deltaY)
}

/**
 * Turns pointer and wheel input on the canvas into panning, zooming, selection and edits.
 * While a drag runs, its operations are previewed on a copy of the document and committed once
 * on pointer up, so a drag is one undo step and one save.
 * @param editor - The editor state.
 * @returns What the canvas shows, and the handlers to attach to it.
 */
export const useCanvasInteraction = (editor: Editor): CanvasInteraction => {
  const interaction = ref<Interaction>({ kind: 'idle' })
  const hoveredId = ref<string>()
  const hoveredHandle = ref<ResizeHandle>()
  const spaceHeld = ref(false)
  const shiftHeld = ref(false)

  const worldAt = (event: MouseEvent): Point =>
    screenToWorld(editor.viewport.value, pointerOnCanvas(event))

  const updateHover = (event: PointerEvent): void => {
    const document = editor.document.value
    hoveredHandle.value = findHandleAt(editor, pointerOnCanvas(event))?.handle
    const canHover = document && editor.tool.value === 'select'
    hoveredId.value = canHover ? findNodeAtPoint(document, worldAt(event))?.id : undefined
  }

  const onPointerMove = (event: PointerEvent): void => {
    shiftHeld.value = event.shiftKey
    const state = interaction.value
    const document = editor.document.value
    if (state.kind === 'idle') {
      updateHover(event)
      return
    }
    if (state.kind === 'panning') {
      const moved = difference(state.startScreen, pointerOnCanvas(event))
      editor.viewport.value = panBy(state.startViewport, moved.x, moved.y)
      return
    }
    interaction.value = followPointer(state, worldAt(event))
    if (state.kind === 'marquee' && document) {
      const marquee = boundsFromPoints(state.startWorld, worldAt(event))
      editor.select([...new Set([...state.baseSelection, ...findNodesInBounds(document, marquee)])])
    }
  }

  const onPointerUp = (event: PointerEvent): void => {
    const state = followPointer(interaction.value, worldAt(event))
    const document = editor.document.value
    interaction.value = { kind: 'idle' }
    if (!document) return
    const operations = previewOperations(document, state, shiftHeld.value)
    if (operations.length === 0 || !editor.commit(operations)) return
    if (state.kind !== 'drawing') return
    editor.select([state.nodeId])
    editor.setTool('select')
  }

  return {
    shownDocument: usePreview(editor, interaction, shiftHeld),
    hoveredId,
    marquee: computed(() =>
      interaction.value.kind === 'marquee'
        ? boundsFromPoints(interaction.value.startWorld, interaction.value.currentWorld)
        : undefined
    ),
    isBusy: computed(() => interaction.value.kind !== 'idle'),
    cursor: computed(() =>
      pickCursor(editor, interaction.value, spaceHeld.value, hoveredHandle.value)
    ),
    spaceHeld,
    onPointerDown: (event: PointerEvent) => {
      const document = editor.document.value
      // A right-click opens the context menu on the current selection instead of starting a drag.
      if (!document || event.button === SECONDARY_BUTTON) return
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      shiftHeld.value = event.shiftKey
      interaction.value = startDrag(editor, document, event, spaceHeld.value)
    },
    onPointerMove,
    onPointerUp,
    onPointerLeave: () => {
      hoveredId.value = undefined
    },
    onWheel: (event: WheelEvent) => zoomOrPan(editor, event)
  }
}
