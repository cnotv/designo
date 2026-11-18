import { createGlyphAtlas } from '../text/glyphAtlas.ts'
import { createGlyphRasterizer } from '../text/glyphRasterizer.ts'
import type { TextRuntime } from '../text/types.ts'
import type { GlyphDrawStep, GlyphPipeline, SceneItem } from '../types.ts'
import { createAtlasTextures } from './atlasTextures.ts'
import {
  GLYPH_BYTES,
  GLYPH_VERTEX_WORDS,
  GLYPH_VERTICES,
  buildTextDrawList
} from './glyphDrawList.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import { GLYPH_FRAGMENT_SHADER, GLYPH_VERTEX_SHADER } from './shaders.ts'

const ATLAS_PAGE_SIZE = 2048
const ATLAS_MAX_PAGES = 4
// One transparent texel around each glyph, so bilinear filtering at its edge reads nothing of its
// neighbour.
const ATLAS_PADDING = 1
const INDICES_PER_GLYPH = 6
const VERTEX_STRIDE = GLYPH_VERTEX_WORDS * 4
const FLOAT_BYTES = 4
const UV_OFFSET = 2 * FLOAT_BYTES
const COLOR_OFFSET = 3 * FLOAT_BYTES
const INITIAL_INDEXED_GLYPHS = 4096
const GLYPH_UNIFORMS = ['u_viewport', 'u_size', 'u_atlas'] as const

// Two triangles a glyph over its four corners, the same pattern for every glyph, so a run of any
// length is drawn from the start of this one buffer.
const QUAD_PATTERN = [0, 1, 2, 2, 1, 3] as const

const createQuadIndices = (glyphCount: number): Uint32Array =>
  Uint32Array.from({ length: glyphCount * INDICES_PER_GLYPH }, (_, position) => {
    const glyph = Math.floor(position / INDICES_PER_GLYPH)
    return glyph * GLYPH_VERTICES + (QUAD_PATTERN[position % INDICES_PER_GLYPH] ?? 0)
  })

/**
 * Makes the glyph pipeline: the shared atlas with its GPU textures, and the textured-triangle
 * program that draws a text node's glyphs from it, one draw per run of glyphs on one page.
 * @param gl - The WebGL2 context.
 * @param runtime - The fonts and engine the glyphs come from.
 * @returns The pipeline, or undefined where its program does not compile, which leaves all text
 * to the Canvas 2D texture path.
 */
export const createGlyphPipeline = (
  gl: WebGL2RenderingContext,
  runtime: TextRuntime
): GlyphPipeline | undefined => {
  const program = linkProgram(gl, GLYPH_VERTEX_SHADER, GLYPH_FRAGMENT_SHADER)
  if (!program) return undefined
  const uniforms = readUniforms(gl, program, GLYPH_UNIFORMS)
  const vertexBuffer = gl.createBuffer()
  const indexBuffer = gl.createBuffer()
  const vertexArray = gl.createVertexArray()
  const state = { indexedGlyphs: 0 }
  const atlas = createGlyphAtlas({
    pageWidth: ATLAS_PAGE_SIZE,
    pageHeight: ATLAS_PAGE_SIZE,
    maxPages: ATLAS_MAX_PAGES,
    padding: ATLAS_PADDING,
    rasterizeGlyph: createGlyphRasterizer(runtime.registry)
  })
  const atlasTextures = createAtlasTextures(gl, atlas)

  // The index buffer is part of the vertex array's state, so it is filled while that is bound.
  const ensureIndices = (glyphCount: number): void => {
    if (glyphCount <= state.indexedGlyphs) return
    state.indexedGlyphs = Math.max(glyphCount, state.indexedGlyphs * 2, INITIAL_INDEXED_GLYPHS)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, createQuadIndices(state.indexedGlyphs), gl.STATIC_DRAW)
  }

  // WebGL2 has no base vertex, so a run starts where the attributes point.
  const pointAttributesAt = (firstGlyph: number): void => {
    const base = firstGlyph * GLYPH_BYTES
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, VERTEX_STRIDE, base)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.UNSIGNED_SHORT, true, VERTEX_STRIDE, base + UV_OFFSET)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, VERTEX_STRIDE, base + COLOR_OFFSET)
  }

  const drawGlyphRun = (step: GlyphDrawStep): void => {
    gl.useProgram(program)
    gl.bindVertexArray(vertexArray)
    pointAttributesAt(step.firstGlyph)
    gl.activeTexture(gl.TEXTURE0)
    atlasTextures.bindPage(step.pageIndex)
    gl.uniform1i(uniforms.u_atlas, 0)
    gl.drawElements(gl.TRIANGLES, step.glyphCount * INDICES_PER_GLYPH, gl.UNSIGNED_INT, 0)
  }

  gl.bindVertexArray(vertexArray)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  ensureIndices(INITIAL_INDEXED_GLYPHS)
  gl.bindVertexArray(null)

  return {
    viewTarget: { program, uniforms },
    beginFrame: atlas.beginFrame,
    drawTexts: (items: readonly SceneItem[], devicePixelsPerUnit, drawFallback) => {
      const list = buildTextDrawList({ items, devicePixelsPerUnit, engine: runtime.engine, atlas })
      atlasTextures.applyChanges()
      gl.bindVertexArray(vertexArray)
      ensureIndices(list.vertices.length / GLYPH_BYTES)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, list.vertices, gl.DYNAMIC_DRAW)
      list.steps.forEach((step) => {
        if (step.kind === 'glyphs') drawGlyphRun(step)
        else drawFallback(step.node)
      })
    },
    getStats: () => ({ pages: atlas.getPageCount(), glyphs: atlas.getGlyphCount() }),
    dispose: () => {
      atlasTextures.dispose()
      gl.deleteVertexArray(vertexArray)
      gl.deleteBuffer(vertexBuffer)
      gl.deleteBuffer(indexBuffer)
      gl.deleteProgram(program)
    }
  }
}
