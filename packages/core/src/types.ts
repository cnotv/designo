export type DesignNodeType = 'page' | 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text'

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
}

export interface DesignNode extends DesignNodeProperties {
  id: string
  type: DesignNodeType
  parentId: string | null
  /** Sort key among siblings; a new sibling between two others takes the midpoint. */
  order: number
}

export interface DesignDocument {
  formatVersion: 1
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
