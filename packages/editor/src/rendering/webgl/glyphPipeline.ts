import { createGlyphAtlas } from '../text/glyphAtlas.ts'
import { createGlyphRasterizer } from '../text/glyphRasterizer.ts'
import type { TextRuntime } from '../text/types.ts'
import type { GlyphDrawStep, GlyphPipeline, SceneItem, ViewUniformTarget } from '../types.ts'
import { createAtlasTextures } from './atlasTextures.ts'
import { GLYPH_INSTANCE_FLOATS, buildTextDrawList } from './glyphDrawList.ts'
import { QUAD_VERTEX_COUNT, bindQuadCorners } from './glQuad.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import { GLYPH_FRAGMENT_SHADER, GLYPH_VERTEX_SHADER } from './shaders.ts'

const FLOAT_BYTES = 4
const ATLAS_PAGE_SIZE = 2048
const ATLAS_MAX_PAGES = 4
// One transparent texel around each glyph, so bilinear filtering at its edge reads nothing of its
// neighbour.
const ATLAS_PADDING = 1

// Location, component count and float offset of each per-instance attribute, matching
// `GLYPH_INSTANCE_FLOATS` and the order `buildTextDrawList` writes them.
const GLYPH_ATTRIBUTES = [
  { location: 1, size: 4, offset: 0 },
  { location: 2, size: 2, offset: 4 },
  { location: 3, size: 4, offset: 6 },
  { location: 4, size: 4, offset: 10 }
] as const

const GLYPH_UNIFORMS = ['u_viewport', 'u_size', 'u_atlas'] as const

/**
 * Makes the glyph pipeline: the shared atlas with its GPU textures, and the textured-quad program
 * that draws a text node's glyphs from it, one instanced draw per run of glyphs on one page.
 * @param gl - The WebGL2 context.
 * @param quad - The shared unit quad's vertex buffer.
 * @param runtime - The fonts and engine the glyphs come from.
 * @returns The pipeline, or undefined where its program does not compile, which leaves all text
 * to the Canvas 2D texture path.
 */
export const createGlyphPipeline = (
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer,
  runtime: TextRuntime
): GlyphPipeline | undefined => {
  const program = linkProgram(gl, GLYPH_VERTEX_SHADER, GLYPH_FRAGMENT_SHADER)
  if (!program) return undefined
  const uniforms = readUniforms(gl, program, GLYPH_UNIFORMS)
  const instances = gl.createBuffer()
  const vertexArray = gl.createVertexArray()
  const atlas = createGlyphAtlas({
    pageWidth: ATLAS_PAGE_SIZE,
    pageHeight: ATLAS_PAGE_SIZE,
    maxPages: ATLAS_MAX_PAGES,
    padding: ATLAS_PADDING,
    rasterizeGlyph: createGlyphRasterizer(runtime.registry)
  })

  // WebGL2 has no base instance, so a run starts where the attributes point.
  const pointAttributesAt = (firstInstance: number): void => {
    gl.bindBuffer(gl.ARRAY_BUFFER, instances)
    GLYPH_ATTRIBUTES.forEach(({ location, size, offset }) => {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(
        location,
        size,
        gl.FLOAT,
        false,
        GLYPH_INSTANCE_FLOATS * FLOAT_BYTES,
        (firstInstance * GLYPH_INSTANCE_FLOATS + offset) * FLOAT_BYTES
      )
      gl.vertexAttribDivisor(location, 1)
    })
  }

  gl.bindVertexArray(vertexArray)
  bindQuadCorners(gl, quad)
  gl.bindVertexArray(null)
  const atlasTextures = createAtlasTextures(gl, atlas)

  const drawGlyphRun = (step: GlyphDrawStep): void => {
    gl.useProgram(program)
    gl.bindVertexArray(vertexArray)
    pointAttributesAt(step.firstInstance)
    gl.activeTexture(gl.TEXTURE0)
    atlasTextures.bindPage(step.pageIndex)
    gl.uniform1i(uniforms.u_atlas, 0)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT, step.instanceCount)
  }

  const viewTarget: ViewUniformTarget = { program, uniforms }

  return {
    viewTarget,
    beginFrame: atlas.beginFrame,
    drawTexts: (items: readonly SceneItem[], devicePixelsPerUnit, drawFallback) => {
      const list = buildTextDrawList({
        items,
        devicePixelsPerUnit,
        engine: runtime.engine,
        atlas
      })
      atlasTextures.applyChanges()
      gl.bindBuffer(gl.ARRAY_BUFFER, instances)
      gl.bufferData(gl.ARRAY_BUFFER, list.instances, gl.DYNAMIC_DRAW)
      list.steps.forEach((step) => {
        if (step.kind === 'glyphs') drawGlyphRun(step)
        else drawFallback(step.node)
      })
    },
    getStats: () => ({ pages: atlas.getPageCount(), glyphs: atlas.getGlyphCount() }),
    dispose: () => {
      atlasTextures.dispose()
      gl.deleteVertexArray(vertexArray)
      gl.deleteBuffer(instances)
      gl.deleteProgram(program)
    }
  }
}
