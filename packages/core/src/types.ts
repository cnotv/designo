import type { BLEND_MODES, CURRENT_FORMAT_VERSION } from './defaults.ts'
export type DesignNodeType = 'page' | 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text'

/** Which edge a text node's lines sit against, inside the node's width. */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/** Whether a text is upright or slanted. */
export type FontStyle = 'normal' | 'italic'

/** How a node's pixels combine with what is painted beneath it. */
export type BlendMode = (typeof BLEND_MODES)[number]

/** One colour along a gradient; `offset` runs from 0 at the start to 1 at the end. */
export interface GradientStop {
  offset: number
  color: string
}

/**
 * A fill that blends colours across the node's box. A linear gradient runs along `angle`, in
 * degrees clockwise from pointing right; a radial one runs from the centre to the box's edge
 * and ignores `angle`.
 */
export interface Gradient {
  kind: 'linear' | 'radial'
  angle: number
  stops: readonly GradientStop[]
}

/** A soft copy of the node drawn behind it, moved by `x` and `y` and blurred by `blur`. */
export interface Shadow {
  x: number
  y: number
  blur: number
  color: string
}

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
  /** When set, paints the node's fill instead of `fill`. */
  gradient: Gradient | null
  /** A gaussian blur of the whole node, as a standard deviation in world units. 0 is sharp. */
  blur: number
  blendMode: BlendMode
  shadow: Shadow | null
  stroke: string | null
  strokeWidth: number
  cornerRadius: number
  text: string
  fontSize: number
  fontFamily: string
  /** A CSS weight from 100 to 900; the family's nearest weight draws it. */
  fontWeight: number
  fontStyle: FontStyle
  /** Extra space after every character, as a multiple of the font size. May be negative. */
  letterSpacing: number
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

/** The weight and style of a font, which with a family name pick one font file. */
export type FontVariant = Pick<DesignNodeProperties, 'fontWeight' | 'fontStyle'>

/** Everything that picks the font file a text is drawn with. */
export type TextFace = FontVariant & Pick<DesignNodeProperties, 'fontFamily'>
