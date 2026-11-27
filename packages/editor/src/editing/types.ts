import type { CodeTarget, PdfColorSpace } from '@designo/exporter'
import type {
  DesignNode,
  DesignOperation,
  FontStyle,
  ListStyle,
  TextAlign,
  TextFace,
  TextSpan
} from '@designo/core'

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Screen position of the world origin, and CSS pixels per world unit. */
export interface Viewport {
  offsetX: number
  offsetY: number
  scale: number
}

export type DrawingTool = 'frame' | 'rectangle' | 'ellipse' | 'text' | 'line'

/** Tools that build a path point by point, with clicks, rather than by dragging out a box. */
export type PathTool = 'pen' | 'polygon'

export type Tool = 'select' | DrawingTool | PathTool

/**
 * A point of a path being drawn, in world units. A pen point dragged out when it was placed has a
 * `handleOut`, the control point its curve leaves along; the curve arrives mirrored.
 */
export interface PenPoint extends Point {
  handleOut?: Point
}

/** Which part of an anchor a drag holds: the point itself, or the handle of the curve into or out of it. */
export type PathEditPart = 'anchor' | 'handleIn' | 'handleOut'

/** One anchor of a path being edited, and the part of it. */
export interface PathEditTarget {
  contour: number
  index: number
  part: PathEditPart
}

/** A point to grab on a path being edited, in world units. */
export interface PathEditHandle extends PathEditTarget {
  point: Point
}

/** The path whose anchors are shown for editing, and the anchor whose handles are shown. */
export interface PathEditSession {
  nodeId: string
  selected: { contour: number; index: number } | undefined
}

/** A path the pen or polygon tool is drawing: the points placed so far, before it is committed. */
export interface PathDraft {
  tool: PathTool
  nodeId: string
  parentId: string
  points: readonly PenPoint[]
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** What a pointer drag on the canvas is doing, from pointer down to pointer up. */
export type Interaction =
  | { kind: 'idle' }
  | { kind: 'panning'; startScreen: Point; startViewport: Viewport }
  | { kind: 'moving'; nodeIds: readonly string[]; startWorld: Point; currentWorld: Point }
  | {
      kind: 'resizing'
      nodeId: string
      handle: ResizeHandle
      startBounds: Bounds
      rotation: number
      startWorld: Point
      currentWorld: Point
    }
  | {
      kind: 'rotating'
      nodeId: string
      center: Point
      startRotation: number
      startWorld: Point
      currentWorld: Point
    }
  | {
      kind: 'drawing'
      tool: DrawingTool
      nodeId: string
      parentId: string
      startWorld: Point
      currentWorld: Point
    }
  /** An anchor or handle of a path in edit mode being dragged. */
  | {
      kind: 'editingPath'
      nodeId: string
      target: PathEditTarget
      startWorld: Point
      currentWorld: Point
    }
  /** A pen or polygon point just placed; dragging it out sets the handle of a pen curve. */
  | { kind: 'placingPoint'; startWorld: Point; currentWorld: Point }
  | {
      kind: 'marquee'
      startWorld: Point
      currentWorld: Point
      baseSelection: readonly string[]
    }

/** One undoable step: the batch that made it, and the batch that reverts it. */
export interface HistoryEntry {
  forward: readonly DesignOperation[]
  backward: readonly DesignOperation[]
}

export interface HistoryState {
  undoStack: readonly HistoryEntry[]
  redoStack: readonly HistoryEntry[]
}

export interface LayerRow {
  node: DesignNode
  depth: number
}

export type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

export type DistributeAxis = 'horizontal' | 'vertical'

/** A line the dragged bounds snapped to, in world units. A vertical guide is a line of equal x. */
export interface SnapGuide {
  orientation: 'vertical' | 'horizontal'
  position: number
  start: number
  end: number
}

export interface SnapResult {
  /** The pointer distance to apply instead of the raw one. */
  delta: Point
  guides: readonly SnapGuide[]
}

export interface ResizeSnapRequest {
  nodeId: string
  startBounds: Bounds
  handle: ResizeHandle
  delta: Point
  threshold: number
}

export interface DrawRequest {
  tool: DrawingTool
  nodeId: string
  parentId: string
  start: Point
  current: Point
  keepSquare: boolean
}

/** Node subtrees held for pasting: every node in them, parents before children. */
export interface ClipboardContent {
  rootIds: readonly string[]
  nodes: readonly DesignNode[]
}

/** A batch that adds copies, and the ids of the copies at the top of each subtree. */
export interface CreatedNodes {
  operations: DesignOperation[]
  rootIds: string[]
}

/** A batch that restructures the document, and what should be selected afterwards. */
export interface SelectionChange {
  operations: DesignOperation[]
  selection: string[]
}

export type LayerOrderMode = 'forward' | 'backward' | 'front' | 'back'

export type NodeIdFactory = (prefix: string) => string

/** An image or document format, or a kind of code. */
export type ExportFormat = 'svg' | 'png' | 'pdf' | CodeTarget

export interface ExportSettings {
  format: ExportFormat
  /** Pixel density of a PNG; an SVG or a PDF is vector and ignores it. */
  scale: number
  /** PDF only: crop marks at the corners of each page's trim box. */
  trimMarks: boolean
  /** PDF only: vector colour as designed (`rgb`) or converted to print inks (`cmyk`). */
  colorSpace: PdfColorSpace
}

export interface PixelSize {
  width: number
  height: number
}

/** The text node being edited in place; a new one is deleted again when committed empty. */
export interface TextEditSession {
  nodeId: string
  isNew: boolean
}

/** Where the text editor overlay sits on the canvas, in CSS pixels. */
/** Whether a text node's box follows its words or holds a width its lines wrap at. */
export type TextWidthMode = 'auto' | 'fixed'

/** What a text node's box depends on, for a measurer to size it. */
export interface TextBoxRequest extends TextFace {
  text: string
  fontSize: number
  letterSpacing: number
  lineHeight: number
  textAlign: TextAlign
  /** The width a fixed-width box wraps at; undefined for an auto-width one. */
  wrapWidth: number | undefined
  spans: readonly TextSpan[]
  listStyle: ListStyle
  listIndent: number
}

export interface TextBoxSize {
  width: number
  height: number
}

/** Sizes a text box. The app measures with the shaped layout; tests and the first frame estimate. */
export type TextBoxMeasurer = (request: TextBoxRequest) => TextBoxSize

export interface TextOverlayLayout {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  fontWeight: number
  fontStyle: FontStyle
  /** Extra space after each character, in CSS pixels. */
  letterSpacing: number
  lineHeight: number
  textAlign: TextAlign
  /** True for a fixed-width box, whose lines wrap at the box's width. */
  isWrapping: boolean
  rotation: number
  /** The node's centre, from the box's top-left, which the box turns around as the canvas does. */
  rotationOriginX: number
  rotationOriginY: number
}

/** Something placed on the canvas, as the spatial index sees it. */
export interface SpatialEntry {
  id: string
  bounds: Bounds
  /** Position in paint order, so a hit test can pick the topmost of several candidates. */
  order: number
}

export interface SpatialTreeNode {
  bounds: Bounds
  children: readonly SpatialTreeNode[]
  entries: readonly SpatialEntry[]
}

/** A packed R-tree over entry bounds, built once per document and only read afterwards. */
export interface SpatialIndex {
  root: SpatialTreeNode | undefined
  depth: number
  size: number
}

export type AccountStatus = 'pending' | 'approved' | 'blocked'

/** Who is signed in, for the account menu. */
export interface SignedInAccount {
  email: string
  name: string
  isAdmin: boolean
}

/** One row of the Accounts screen, as the admin route lists it. */
export interface AccountSummary {
  id: string
  email: string
  name: string
  status: AccountStatus
  /** ISO 8601. */
  createdAt: string
  isAdmin: boolean
}

/** One agent the signed-in account has approved, as `/api/connections` lists it. */
export interface ConnectedAgent {
  id: string
  clientName: string
  /** ISO 8601. */
  connectedAt: string
  /** ISO 8601. */
  expiresAt: string
}

/** What the server said to a request to disconnect an agent. */
export type DisconnectOutcome = 'removed' | 'refused' | 'failed'

export type AccountAction = 'approve' | 'block' | 'unblock'

export interface AccountActionButton {
  action: AccountAction
  label: string
  variant: 'outline' | 'destructive'
}

/** What the server says about who is asking, from `/api/me`. */
export type AccessAnswer =
  /** Sign-in is off, or there is no Designo server (a static host): the editor needs no gate. */
  | { kind: 'not-required' }
  | { kind: 'signed-out' }
  | {
      kind: 'account'
      email: string
      name: string
      status: AccountStatus
      isAdmin: boolean
    }

/** Which screen the app shows: the editor itself, or a gate in front of it. */
export type GateScreen =
  | { screen: 'loading' }
  /** `account` is set only when sign-in is on: it is who the account menu shows. */
  | { screen: 'editor'; account?: SignedInAccount }
  | { screen: 'signed-out'; signInFailed: boolean }
  | { screen: 'pending'; email: string }
  | { screen: 'blocked'; email: string }
