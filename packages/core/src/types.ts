import type {
  BLEND_MODES,
  CURRENT_FORMAT_VERSION,
  IMAGE_FITS,
  LIST_STYLES,
  PDF_TAGS,
  TEXT_STYLE_PROPERTIES
} from './defaults.ts'
export type ImageFit = (typeof IMAGE_FITS)[number]
export type ListStyle = (typeof LIST_STYLES)[number]

/** What a text is in the tagged structure of an exported PDF: a heading level, a paragraph or a list item. */
export type PdfTag = (typeof PDF_TAGS)[number]

/**
 * A stretch of a text node's `text`, as UTF-16 offsets, drawn with its own weight, style or colour.
 * A property a span leaves out follows the node. Spans never overlap and are kept in order.
 */
export interface TextSpan {
  start: number
  end: number
  fontWeight?: number
  fontStyle?: FontStyle
  fill?: string
}
export type DesignNodeType = 'page' | 'frame' | 'group' | 'rectangle' | 'ellipse' | 'text' | 'image'

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

/** A layer of a stationery template; positions and sizes are in millimetres on the page. */
export interface TemplateNode {
  type: 'text' | 'rectangle'
  name: string
  x: number
  y: number
  width: number
  height: number
  properties?: DesignNodePatch
}

/** A ready layout for stationery, which a person starts a design from. */
export interface StationeryTemplate {
  /** Stable id, such as `letterhead`. */
  id: string
  name: string
  /** The `id` of a size in `PAPER_SIZES`. */
  paperSizeId: string
  nodes: readonly TemplateNode[]
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
  /**
   * Images only: the id of the stored picture, drawn in the node's box as `imageFit` says; null draws the
   * node's `fill` as a placeholder.
   */
  imageAsset: string | null
  /** Images only: stretch distorts the picture to the box, fit shows all of it, fill covers the box and crops. */
  imageFit: ImageFit
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
  /** Text only: stretches of `text` drawn in their own weight, style or colour. */
  spans: readonly TextSpan[]
  /** Text only: gives every paragraph a bullet or a number, with its lines indented past the marker. */
  listStyle: ListStyle
  /** Text only: how far a list's lines are indented past the marker, as a multiple of the font size. */
  listIndent: number
  /**
   * Frames only: a whole number from 1 makes the frame a page of the exported PDF, in that order;
   * null leaves it out. A document with no such frame exports a page for each design page.
   */
  pdfPage: number | null
  /**
   * Text, rectangles and frames: an `https:`, `mailto:` or `tel:` address the node opens when
   * clicked in the exported PDF; null is no link.
   */
  link: string | null
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

/**
 * How a frame takes part in master pages. A master frame (`isMaster`) holds what pages share. A page
 * frame names it in `masterId`, and `masterHidden` lists ids of the master's direct children that
 * this page leaves out, so it can draw its own in their place.
 */
export interface DesignNodeMasterLinks {
  isMaster?: boolean
  masterId?: string | null
  masterHidden?: readonly string[]
}

/**
 * Text only: how a tagged PDF names the text. Absent or null leaves it untagged; a PDF with no
 * tagged text is not tagged at all.
 */
export interface DesignNodeTagging {
  pdfTag?: PdfTag | null
}

/**
 * How a node takes part in variables and text styles. `bindings` maps a property name to the id of
 * a variable that sets it; `textStyleId` names a text style, and `styleOverrides` lists the style
 * properties the node keeps for itself. Every change to a variable or style is resolved into the
 * node's own properties, so a reader that ignores these still sees the final values.
 */
export interface DesignNodeStyleLinks {
  bindings?: Readonly<Record<string, string>>
  textStyleId?: string | null
  styleOverrides?: readonly string[]
}

export interface DesignNode
  extends
    DesignNodeProperties,
    DesignNodeComponentLinks,
    DesignNodeMasterLinks,
    DesignNodeTagging,
    DesignNodeStyleLinks {
  id: string
  type: DesignNodeType
  parentId: string | null
  /** Sort key among siblings; a new sibling between two others takes the midpoint. */
  order: number
}

/** What a PDF's info dictionary, XMP and catalog say about the file. An empty or absent field is left out. */
export interface DocumentMetadata {
  title?: string
  author?: string
  subject?: string
  /** A BCP 47 language tag such as `en` or `de-DE`, written as the PDF's `Lang`. */
  language?: string
}

/** A named value of the document that nodes reference instead of copying it. */
export interface DesignVariable {
  id: string
  name: string
  kind: 'color' | 'number'
  /** A hex colour for a colour variable, a number for a number variable. */
  value: string | number
}

/** The properties a text style sets. */
export type TextStyleProperties = Pick<DesignNodeProperties, (typeof TEXT_STYLE_PROPERTIES)[number]>

/** A named bundle of type settings that text nodes reference. */
export interface TextStyle extends TextStyleProperties {
  id: string
  name: string
}

export interface DesignDocument {
  formatVersion: typeof CURRENT_FORMAT_VERSION
  id: string
  name: string
  /** Written to the exported PDF; the title falls back to `name`. */
  metadata?: DocumentMetadata
  variables?: Readonly<Record<string, DesignVariable>>
  textStyles?: Readonly<Record<string, TextStyle>>
  rootId: string
  nodes: Readonly<Record<string, DesignNode>>
}

export type DesignNodePatch = Partial<DesignNodeProperties> &
  Partial<DesignNodeComponentLinks> &
  Partial<DesignNodeMasterLinks> &
  Partial<DesignNodeTagging> &
  Partial<DesignNodeStyleLinks>

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
  /** Changes the document's metadata; a field set to an empty string is cleared. */
  | { kind: 'updateMetadata'; patch: DocumentMetadata }
  /** Adds a variable or changes the one with the same id; every node that uses it follows. */
  | { kind: 'setVariable'; variable: DesignVariable }
  /** Removes a variable; nodes that used it keep its last value. */
  | { kind: 'deleteVariable'; id: string }
  /** Adds a text style or changes the one with the same id; every text that uses it follows. */
  | { kind: 'setTextStyle'; style: TextStyle }
  /** Removes a text style; texts that used it keep its last values. */
  | { kind: 'deleteTextStyle'; id: string }

/** The operations that change the document's variables and text styles. */
export type StyleOperation = Extract<
  DesignOperation,
  { kind: 'setVariable' | 'deleteVariable' | 'setTextStyle' | 'deleteTextStyle' }
>

export type OperationResult = { ok: true; document: DesignDocument } | { ok: false; error: string }

export interface DesignNodeTree {
  node: DesignNode
  children: readonly DesignNodeTree[]
}

/** The weight and style of a font, which with a family name pick one font file. */
export type FontVariant = Pick<DesignNodeProperties, 'fontWeight' | 'fontStyle'>

/** Everything that picks the font file a text is drawn with. */
export type TextFace = FontVariant & Pick<DesignNodeProperties, 'fontFamily'>

/** How `combinePaths` merges outlines: add them, cut the later ones from the first, keep what they share, or keep what they do not. */
export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude'

/** A box in the same space as a path outline. */
export interface PathBounds {
  x: number
  y: number
  width: number
  height: number
}
