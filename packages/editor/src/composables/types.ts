import type {
  BooleanOperation,
  DesignDocument,
  DesignNode,
  DesignNodePatch,
  DesignOperation,
  StationeryTemplate
} from '@designo/core'
import type { AtsReport } from '@designo/ats'
import type { DocumentSummary } from '@designo/storage'
import type { ComputedRef, Ref } from 'vue'
import type {
  AccountAction,
  AccountSummary,
  AlignKind,
  Bounds,
  ConnectedAgent,
  DistributeAxis,
  ExportSettings,
  GateScreen,
  HistoryState,
  LayerOrderMode,
  PathDraft,
  PathEditSession,
  PathEditTarget,
  Point,
  SnapGuide,
  TextBoxMeasurer,
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
  /** Removes a file from the server; in the demo, from the list in this tab. */
  deleteFile: (fileId: string) => Promise<void>
  /** Sends a batch the editor has already applied locally; ignored in the demo. */
  saveOperations: (operations: readonly DesignOperation[]) => void
}

export interface Editor {
  /** The shown page as the root of a document view; edits still go to the whole file. */
  document: ComputedRef<DesignDocument | undefined>
  /** Every page of the file, in print order. */
  pages: ComputedRef<DesignNode[]>
  activePageId: ComputedRef<string>
  showPage: (pageId: string) => void
  /** Adds a page after the others and shows it. */
  addPage: () => void
  /** Adds a page laid out from a stationery template and shows it. */
  addPageFromTemplate: (template: StationeryTemplate) => void
  renamePage: (pageId: string, name: string) => void
  movePage: (pageId: string, direction: -1 | 1) => void
  /** Deletes a page with its layers; the only page is kept. */
  deletePage: (pageId: string) => void
  selection: Ref<string[]>
  tool: Ref<Tool>
  viewport: Ref<Viewport>
  canvasSize: Ref<{ width: number; height: number }>
  history: Ref<HistoryState>
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  /** Applies a batch locally, records it for undo and saves it. False when it cannot apply. */
  commit: (operations: readonly DesignOperation[]) => boolean
  /** Sizes a text box the way the canvas lays its text out; the editing box measures with it. */
  measureTextBox: TextBoxMeasurer
  /** The text node being edited in place on the canvas. */
  editingText: Ref<TextEditSession | undefined>
  startTextEdit: (nodeId: string, isNew: boolean) => void
  /** Ends the edit with the typed text: one update, or a delete for a new node left empty. */
  commitTextEdit: (draftText: string) => void
  select: (nodeIds: readonly string[]) => void
  /** The path the pen or polygon tool is drawing, before it is committed. */
  pathDraft: Ref<PathDraft | undefined>
  /** Places the next point of the path, starting one on the first click; a click on the first point closes it. */
  addPathPoint: (point: Point, parentId: string, scale: number) => void
  /** Sets the handle the last point's curve leaves along, as a pen point is dragged out. */
  setPathPointHandle: (handleOut: Point) => void
  /** Commits the path as one node; a polygon closes, a pen line stays open unless asked to close. */
  finishPathDraft: (closed?: boolean) => void
  cancelPathDraft: () => void
  /** The path shown with its anchors and bezier handles, which can be dragged to reshape it. */
  pathEdit: Ref<PathEditSession | undefined>
  /** Shows the anchors of a path node for editing, selecting it. */
  startPathEdit: (nodeId: string) => void
  stopPathEdit: () => void
  /** Picks the anchor whose handles are shown, or none. */
  selectPathAnchor: (selected: PathEditSession['selected']) => void
  /** Removes the picked anchor; the outline closes over the gap. */
  removePathAnchor: () => void
  /** Removes one bezier handle of an anchor, straightening that side of the curve. */
  removePathHandle: (target: PathEditTarget) => void
  /** Switches an anchor between a corner and a smooth point. */
  togglePathAnchor: (address: { contour: number; index: number }) => void
  /** Adds an anchor on the outline at a point, picking it; nothing when the point is off the outline. */
  addPathAnchor: (world: Point, scale: number) => void
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
  /** Replaces the selected shapes with one path: their union, subtraction, intersection or exclusion. */
  combineSelection: (operation: BooleanOperation) => void
  makeComponent: () => void
  createInstance: () => void
  detachInstance: () => void
  resetOverrides: () => void
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
  /** What the last ATS check found; undefined before one runs or after the document changes. */
  atsReport: Ref<AtsReport | undefined>
  isCheckingAts: Ref<boolean>
  /** Exports the PDF and reads it back the way an applicant tracking system would. */
  checkAts: () => Promise<void>
  /** Reads a PDF from disk in the browser and checks it on its own, with no open document. */
  checkPdfFile: (file: File) => Promise<void>
}

export interface AccessGate {
  screen: Ref<GateScreen>
  /** Asks the server again who is visiting, for when it refuses a request mid-session. */
  recheck: () => Promise<void>
  /** Ends the session on the server, then reloads so the app starts signed out. */
  signOut: () => Promise<void>
}

export interface AccountAdministration {
  /** Pending first, so what needs a decision is on top. */
  accounts: Ref<readonly AccountSummary[]>
  isLoading: Ref<boolean>
  /** The account whose change is on its way, so its buttons wait. */
  busyAccountId: Ref<string | undefined>
  error: Ref<string | undefined>
  load: () => Promise<void>
  changeAccount: (accountId: string, action: AccountAction) => Promise<void>
}

export interface ConnectedAgents {
  /** Newest first. */
  agents: Ref<readonly ConnectedAgent[]>
  isLoading: Ref<boolean>
  /** The agent whose disconnect is on its way, so its button waits. */
  busyAgentId: Ref<string | undefined>
  error: Ref<string | undefined>
  load: () => Promise<void>
  disconnect: (agentId: string) => Promise<void>
}
