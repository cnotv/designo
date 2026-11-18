import type { CURRENT_FORMAT_VERSION } from './defaults.ts'
export type DesignNodeType = 'page' | 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text'

/** Which edge a text node's lines sit against, inside the node's width. */
export type TextAlign = 'left' | 'center' | 'right'

export interface DesignNodeProperties {
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  fill: string | null
  stroke: string | null
  strokeWidth: number
  cornerRadius: number
  text: string
  fontSize: number
  fontFamily: string
  textAlign: TextAlign
  /** The distance between lines of text, as a multiple of the font size. */
  lineHeight: number
  /**
   * True when a text node is a fixed-width box: its lines wrap at its width. False sizes the box
   * to its text, so the width follows the words and never wraps them.
   */
  textWrap: boolean
}

export interface DesignNode extends DesignNodeProperties {
  id: string
  type: DesignNodeType
  parentId: string | null
  /** Sort key among siblings; a new sibling between two others takes the midpoint. */
  order: number
}

export interface DesignDocument {
  formatVersion: typeof CURRENT_FORMAT_VERSION
  id: string
  name: string
  rootId: string
  nodes: Readonly<Record<string, DesignNode>>
}

export type DesignNodePatch = Partial<DesignNodeProperties>

export type DesignOperation =
  | {
      kind: 'create'
      id: string
      type: Exclude<DesignNodeType, 'page'>
      parentId: string
      order?: number
      properties?: DesignNodePatch
    }
  | { kind: 'update'; id: string; patch: DesignNodePatch }
  | { kind: 'delete'; id: string }
  | { kind: 'move'; id: string; parentId: string; order?: number }

export type OperationResult = { ok: true; document: DesignDocument } | { ok: false; error: string }

export interface DesignNodeTree {
  node: DesignNode
  children: readonly DesignNodeTree[]
}
