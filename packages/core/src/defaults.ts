import type { DesignNodeProperties } from './types.ts'

/** The file format version this code writes. Bumping it needs one migration step in the storage package. */
export const CURRENT_FORMAT_VERSION = 11

/** The range a text node's `lineHeight` may take, as a multiple of the font size. */
export const MIN_LINE_HEIGHT = 0.5
export const MAX_LINE_HEIGHT = 10

/** The range a text node's `fontWeight` may take. */
export const MIN_FONT_WEIGHT = 100
export const MAX_FONT_WEIGHT = 900

/** The range a text node's `letterSpacing` may take, as a multiple of the font size. */
export const MIN_LETTER_SPACING = -0.5
export const MAX_LETTER_SPACING = 2

export const TEXT_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const
export const PAGE_UNITS = ['pt', 'mm'] as const
export const PAGE_FACINGS = ['single', 'left', 'right', 'spread'] as const

export const FONT_STYLES = ['normal', 'italic'] as const

/** Whether a text's paragraphs are plain, bulleted or numbered. */
export const LIST_STYLES = ['none', 'bullet', 'number'] as const

/** The range of a list's hanging indent, as a multiple of the font size. */
export const MIN_LIST_INDENT = 0
export const MAX_LIST_INDENT = 10

export const LAYOUT_MODES = ['none', 'horizontal', 'vertical'] as const
export const LAYOUT_ALIGNMENTS = ['start', 'center', 'end', 'space-between'] as const
export const LAYOUT_CROSS_ALIGNMENTS = ['start', 'center', 'end'] as const
export const LAYOUT_SIZINGS = ['fixed', 'hug', 'fill'] as const

/** How an image node's picture meets its box: stretched to it, or scaled in proportion inside or over it. */
export const IMAGE_FITS = ['stretch', 'fit', 'fill'] as const

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const

export const DEFAULT_NODE_PROPERTIES: DesignNodeProperties = {
  name: '',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  fill: '#d9d9d9',
  gradient: null,
  blur: 0,
  blendMode: 'normal',
  shadow: null,
  stroke: null,
  strokeWidth: 1,
  cornerRadius: 0,
  imageAsset: null,
  imageFit: 'stretch',
  text: '',
  fontSize: 16,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: 0,
  textAlign: 'left',
  lineHeight: 1.2,
  textWrap: false,
  spans: [],
  listStyle: 'none',
  listIndent: 1.5,
  pdfPage: null,
  link: null,
  layoutMode: 'none',
  layoutGap: 0,
  layoutPadding: 0,
  layoutAlign: 'start',
  layoutCrossAlign: 'start',
  widthSizing: 'fixed',
  heightSizing: 'fixed',
  pageUnit: 'pt',
  bleed: 0,
  facing: 'single',
  guides: null
}

export const CONTAINER_NODE_TYPES = ['page', 'frame', 'group'] as const

export const DATA_DIRECTORY_ENVIRONMENT_VARIABLE = 'DESIGNO_DATA_DIR'

export const DEFAULT_DATA_DIRECTORY_NAME = '.designo-data'
