import type { BLEND_MODES, CURRENT_FORMAT_VERSION } from './defaults.ts'
export type DesignNodeType = 'page' | 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text'

/** Which edge a text node's lines sit against, inside the node's width. */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/** Whether a text is upright or slanted. */
export type FontStyle = 'normal' | 'italic'

/** The unit a page's size, bleed and guides are shown and typed in; stored values are points. */
export type PageUnit = 'pt' | 'mm'

/**
 * What a frame is as a printed page. A left or right page is one of a facing pair, and its inner
 * margin is the one along the spine; a spread is two facing pages drawn as one frame.
 */
export type PageFacing = 'single' | 'left' | 'right' | 'spread'

/** The space kept clear at the edges of a page. The inner margin lies along the spine. */
export interface PageMargins {
  top: number
  bottom: number
  inner: number
  outer: number
}

/**
 * Layout guides of a page: margins, columns with a gutter between them, and a fold down the
 * middle. They are kept on the page and drawn under its content, and are never exported.
 */
export interface PageGuides {
  margins: PageMargins
  columns: number
  gutter: number
  fold: boolean
}

/**
 * A page setup as a person or an agent states it. Lengths are in `unit` (the frame's own when
 * left out), and `getPageSetupPatch` turns it into the points a frame stores. Margin sides left
 * out keep their value; `guides: null` removes the guides.
 */
export interface PageSetupInput {
  unit?: PageUnit
  width?: number
  height?: number
  bleed?: number
  facing?: PageFacing
  margins?: Partial<PageMargins>
  columns?: number
  gutter?: number
  fold?: boolean
  guides?: null
}

/** The properties a page setup changes. */
export type PageSetupPatch = Pick<
  DesignNodePatch,
  'pageUnit' | 'width' | 'height' | 'bleed' | 'facing' | 'guides'
>

/** A family of standard stationery sizes, as the page setup groups them. */
export type PaperSizeGroup = 'iso' | 'us' | 'envelope' | 'card'

/** A standard stationery size, such as A4 or US Letter, in millimetres. */
export interface PaperSize {
  /** Stable id, such as `a4`, used as the select's value. */
  id: string
  /** The name shown in the page setup, such as `A4`. */
  name: string
  group: PaperSizeGroup
  /** The page's width, in millimetres. */
  width: number
  /** The page's height, in millimetres. */
  height: number
}

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

/** Whether a frame lays its children out in a row, in a column, or leaves them where they are. */
export type LayoutMode = 'none' | 'horizontal' | 'vertical'

/** Where a layout frame's children sit along its main axis, when they do not fill it. */
export type LayoutAlign = 'start' | 'center' | 'end' | 'space-between'

/** Where a layout frame's children sit across its main axis. */
export type LayoutCrossAlign = 'start' | 'center' | 'end'

/**
 * How a node's size on one axis is decided. `fixed` keeps the size it has. `hug` sizes a layout
 * frame to its children. `fill` shares a layout parent's free space along its main axis, and
 * stretches across it.
 */
export type LayoutSizing = 'fixed' | 'hug' | 'fill'

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
  /**
   * Frames only: a whole number from 1 makes the frame a page of the exported PDF, in that order;
   * null leaves it out. A document with no such frame exports a page for each design page.
   */
  pdfPage: number | null
  /** Frames only: lays the children out, overwriting their position and any `fill` size. */
  layoutMode: LayoutMode
  /** The space between children of a layout frame. */
  layoutGap: number
  /** The space between a layout frame's edge and its children, on all four sides. */
  layoutPadding: number
  layoutAlign: LayoutAlign
  layoutCrossAlign: LayoutCrossAlign
  widthSizing: LayoutSizing
  heightSizing: LayoutSizing
  /** Frames only: the unit the page's size, bleed and guides are shown in. */
  pageUnit: PageUnit
  /** Frames only: how far the printed area extends past the frame's box, which is the trim. */
  bleed: number
  /** Frames only: whether the frame is a single page, one of a facing pair or a spread. */
  facing: PageFacing
  /** Frames only: layout guides drawn under the content and never exported. */
  guides: PageGuides | null
}

/**
 * How a node takes part in a component. A component is a frame or group with `isComponent`. A node
 * of an instance names the component node it mirrors in `sourceId`, and lists the properties it
 * keeps for itself in `overrides`; the rest follow the component.
 */
export interface DesignNodeComponentLinks {
  isComponent?: boolean
  sourceId?: string
  overrides?: readonly string[]
}

export interface DesignNode extends DesignNodeProperties, DesignNodeComponentLinks {
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

export type DesignNodePatch = Partial<DesignNodeProperties> & Partial<DesignNodeComponentLinks>

export type DesignOperation =
  | {
      kind: 'create'
      id: string
      type: Exclude<DesignNodeType, 'page'>
      parentId: string
      order?: number
      properties?: DesignNodePatch
    }
  /** Adds a page after the others, or at `order`; a page has no parent. */
  | { kind: 'createPage'; id: string; order?: number; properties?: DesignNodePatch }
  | { kind: 'update'; id: string; patch: DesignNodePatch }
  | { kind: 'delete'; id: string }
  | { kind: 'move'; id: string; parentId: string; order?: number }
  /** Places an instance of a component, which mirrors the component until a property is overridden. */
  | {
      kind: 'createInstance'
      id: string
      componentId: string
      parentId: string
      order?: number
      x?: number
      y?: number
    }
  /** Turns an instance into plain nodes that no longer follow the component. */
  | { kind: 'detachInstance'; id: string }
  /** Drops the overrides of a node and everything beneath it, so they follow the component again. */
  | { kind: 'resetOverrides'; id: string }
  /** Puts a page elsewhere in the print order; a page has no parent to move to. */
  | { kind: 'reorderPage'; id: string; order: number }

export type OperationResult = { ok: true; document: DesignDocument } | { ok: false; error: string }

export interface DesignNodeTree {
  node: DesignNode
  children: readonly DesignNodeTree[]
}

/** The weight and style of a font, which with a family name pick one font file. */
export type FontVariant = Pick<DesignNodeProperties, 'fontWeight' | 'fontStyle'>

/** Everything that picks the font file a text is drawn with. */
export type TextFace = FontVariant & Pick<DesignNodeProperties, 'fontFamily'>
