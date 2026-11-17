import type { DesignDocument, DesignNode } from '@designo/core'
import type { Bounds, SnapGuide, SpatialIndex, Viewport } from '../editing/types.ts'

export interface OverlayState {
  selection: readonly string[]
  hoveredId: string | undefined
  marquee: Bounds | undefined
  showHandles: boolean
  color: string
  guides: readonly SnapGuide[]
  guideColor: string
}

/** What a document needs, worked out once per document, to build a scene for any viewport. */
export interface SceneSource {
  document: DesignDocument
  index: SpatialIndex
  /** Each drawn node's position in paint order. */
  paintPosition: ReadonlyMap<string, number>
}

/** One node to draw, with the frames that clip it, outermost first. */
export interface SceneItem {
  node: DesignNode
  clipFrames: readonly DesignNode[]
}

/** A run of items one draw call can take: shapes that share clipping, or a single text. */
export interface SceneBatch {
  kind: 'shapes' | 'text'
  items: readonly SceneItem[]
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
