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
