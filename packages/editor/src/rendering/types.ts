import type { DesignDocument, DesignNode } from '@designo/core'
import type {
  Bounds,
  PathEditHandle,
  PathEditSession,
  SnapGuide,
  SpatialIndex,
  Viewport
} from '../editing/types.ts'
import type { GlyphAtlas, TextEngine } from '@designo/text'

export interface OverlayState {
  selection: readonly string[]
  hoveredId: string | undefined
  marquee: Bounds | undefined
  showHandles: boolean
  color: string
  guides: readonly SnapGuide[]
  guideColor: string
  /** Anchors and handles of a path in edit mode, and which anchor is picked. */
  pathHandles: readonly PathEditHandle[]
  pathSelected: PathEditSession['selected']
}

/** What a document needs, worked out once per document, to build a scene for any viewport. */
export interface SceneSource {
  document: DesignDocument
  index: SpatialIndex
  /** Each drawn node's position in paint order. */
  paintPosition: ReadonlyMap<string, number>
  /** The furthest any node's blur or shadow reaches past its box, so culling keeps soft edges. */
  maxEffectReach: number
}

/** One node to draw, with the frames that clip it, outermost first. */
export interface SceneItem {
  node: DesignNode
  clipFrames: readonly DesignNode[]
}

/** A run of items one draw call can take: shapes, texts, images or paths that share clipping. */
export interface SceneBatch {
  kind: 'shapes' | 'text' | 'image' | 'path'
  items: readonly SceneItem[]
  /** True for a shape with a blend mode, which is drawn alone against a copy of what is behind it. */
  blended: boolean
}

export interface CanvasSize {
  width: number
  height: number
}

export interface Scene {
  items: readonly SceneItem[]
  viewport: Viewport
  size: CanvasSize
  pixelRatio: number
}

/** Draws scenes onto one canvas. WebGL2 implements it, with Canvas 2D as the fallback. */
export interface SceneRenderer {
  kind: 'webgl2' | 'canvas2d'
  render: (scene: Scene) => void
  dispose: () => void
  /** How full the glyph atlas is, where the renderer has one. */
  getTextStats?: () => { pages: number; glyphs: number } | undefined
}

export interface RgbaColor {
  red: number
  green: number
  blue: number
  alpha: number
}

export interface TextRasterSize {
  width: number
  height: number
}

export interface TextTexture {
  texture: WebGLTexture
  /** The raster's size in world units, which can run past the node's box. */
  width: number
  height: number
  lastFrame: number
}

export interface TextTextureCache {
  get: (node: DesignNode, devicePixelsPerUnit: number, frame: number) => TextTexture
  /** Drops the textures not used this frame, once the cache has grown past its limit. */
  evictUnused: (frame: number) => void
  dispose: () => void
}

export interface ViewUniformTarget {
  program: WebGLProgram
  uniforms: Record<'u_viewport' | 'u_size', WebGLUniformLocation | null>
}

/** One draw of glyph quads that all sample the same atlas page. */
export interface GlyphDrawStep {
  kind: 'glyphs'
  pageIndex: number
  /** The first glyph of the run in the draw list's vertex data. */
  firstGlyph: number
  glyphCount: number
}

/** A text node the glyph path could not draw, left to the Canvas 2D texture path. */
export interface FallbackDrawStep {
  kind: 'fallback'
  node: DesignNode
}

export type TextDrawStep = GlyphDrawStep | FallbackDrawStep

/** What drawing a batch of text takes, in paint order: vertex data and the steps over it. */
export interface TextDrawList {
  /** `GLYPH_BYTES` bytes per glyph: four vertices of position, atlas position and colour. */
  vertices: Uint8Array
  steps: readonly TextDrawStep[]
}

/** Where the scene is on the device's pixel grid. */
export interface TextDrawView {
  /** Viewport scale times the device pixel ratio. */
  devicePixelsPerUnit: number
  /** The viewport's pan in device pixels. */
  deviceOffsetX: number
  deviceOffsetY: number
}

export interface TextDrawListInput {
  items: readonly SceneItem[]
  view: TextDrawView
  engine: Pick<TextEngine, 'getNodeLayout'>
  atlas: Pick<GlyphAtlas, 'lookupGlyph' | 'pageWidth' | 'pageHeight'>
}

/** What the WebGL2 renderer needs of the glyph path: set its view, draw texts, let go. */
export interface GlyphPipeline {
  viewTarget: ViewUniformTarget
  /** Starts a frame in the atlas, so pages used since are not evicted. */
  beginFrame: () => void
  /**
   * Draws a run of text nodes from the atlas, calling back for each node it cannot draw, in its
   * place in the paint order.
   */
  drawTexts: (
    items: readonly SceneItem[],
    view: TextDrawView,
    drawFallback: (node: DesignNode) => void
  ) => void
  getStats: () => { pages: number; glyphs: number }
  dispose: () => void
}
