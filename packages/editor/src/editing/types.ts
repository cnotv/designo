import type { DesignNode, DesignOperation } from '@designo/core'

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

export type DrawingTool = 'frame' | 'rectangle' | 'ellipse' | 'text'

export type Tool = 'select' | DrawingTool

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

export type ExportFormat = 'svg' | 'png'

export interface ExportSettings {
  format: ExportFormat
  /** Pixel density of a PNG; an SVG is vector and ignores it. */
  scale: number
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
export interface TextOverlayLayout {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  lineHeight: number
  rotation: number
  /** The node's centre, from the box's top-left, which the box turns around as the canvas does. */
  rotationOriginX: number
  rotationOriginY: number
}
