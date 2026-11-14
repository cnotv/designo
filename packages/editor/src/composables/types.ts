import type { DesignDocument, DesignNodePatch, DesignOperation } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'
import type { ComputedRef, Ref } from 'vue'
import type {
  AlignKind,
  Bounds,
  DistributeAxis,
  ExportSettings,
  HistoryState,
  LayerOrderMode,
  SnapGuide,
  TextEditSession,
  Tool,
  Viewport
} from '../editing/types.ts'

export interface DesignoFiles {
  documentSummaries: Ref<DocumentSummary[]>
  selectedFileId: Ref<string | undefined>
  activeDocument: Ref<DesignDocument | undefined>
  isDemo: Ref<boolean>
  saveError: Ref<string | undefined>
  selectFile: (fileId: string) => void
  /** Sends a batch the editor has already applied locally; ignored in the demo. */
  saveOperations: (operations: readonly DesignOperation[]) => void
}

export interface Editor {
  document: Ref<DesignDocument | undefined>
  selection: Ref<string[]>
  tool: Ref<Tool>
  viewport: Ref<Viewport>
  canvasSize: Ref<{ width: number; height: number }>
  history: Ref<HistoryState>
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  /** Applies a batch locally, records it for undo and saves it. False when it cannot apply. */
  commit: (operations: readonly DesignOperation[]) => boolean
  /** The text node being edited in place on the canvas. */
  editingText: Ref<TextEditSession | undefined>
  startTextEdit: (nodeId: string, isNew: boolean) => void
  /** Ends the edit with the typed text: one update, or a delete for a new node left empty. */
  commitTextEdit: (draftText: string) => void
  select: (nodeIds: readonly string[]) => void
  setTool: (tool: Tool) => void
  setCanvasSize: (size: { width: number; height: number }) => void
  updateNode: (nodeId: string, patch: DesignNodePatch) => void
  deleteSelection: () => void
  nudgeSelection: (deltaX: number, deltaY: number) => void
  selectAll: () => void
  duplicateSelection: () => void
  copySelection: () => void
  cutSelection: () => void
  paste: () => void
  groupSelection: () => void
  ungroupSelection: () => void
  reorderSelection: (mode: LayerOrderMode) => void
  alignSelection: (kind: AlignKind) => void
  distributeSelection: (axis: DistributeAxis) => void
  undo: () => void
  redo: () => void
  zoomToFit: () => void
  zoomTo: (scale: number) => void
}

export interface CanvasInteraction {
  /** The document with the running drag's preview applied. */
  shownDocument: ComputedRef<DesignDocument | undefined>
  /** The snap lines the running drag is on. */
  guides: ComputedRef<readonly SnapGuide[]>
  hoveredId: Ref<string | undefined>
  marquee: ComputedRef<Bounds | undefined>
  isBusy: ComputedRef<boolean>
  cursor: ComputedRef<string>
  spaceHeld: Ref<boolean>
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerLeave: () => void
  onDoubleClick: (event: MouseEvent) => void
  onWheel: (event: WheelEvent) => void
}

export interface ExportController {
  settings: Ref<ExportSettings>
  isExporting: Ref<boolean>
  error: Ref<string | undefined>
  /** Downloads the selection, or the page, with the current settings. */
  run: () => Promise<void>
}
