import type { DesignNode } from '@designo/core'
import type { Scene, ViewUniformTarget } from '../types.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import { QUAD_VERTEX_COUNT, bindQuadCorners } from './glQuad.ts'
import { TEXTURE_FRAGMENT_SHADER, TEXTURE_VERTEX_SHADER } from './shaders.ts'
import { createTextTextureCache } from './textTextures.ts'

const HALF_TURN_DEGREES = 180

const TEXTURE_UNIFORMS = [
  'u_viewport',
  'u_size',
  'u_center',
  'u_nodeHalfSize',
  'u_textureSize',
  'u_rotation',
  'u_opacity',
  'u_texture'
] as const

/** Draws a text node from a texture of its own, which Canvas 2D rasterised. */
export interface TextureTextDrawer {
  viewTarget: ViewUniformTarget
  draw: (node: DesignNode, scene: Scene, frame: number) => void
  /** Drops the textures not used this frame, once the cache has grown past its limit. */
  evictUnused: (frame: number) => void
  dispose: () => void
}

/**
 * Makes the path that draws a text node as one textured quad, from a texture the browser's own
 * text drawing filled. It is the fallback of the glyph path: text whose fonts are still loading,
 * or that the bundled fonts cannot draw, such as emoji.
 * @param gl - The WebGL2 context.
 * @param quad - The shared unit quad's vertex buffer.
 * @returns The drawer, or undefined where its program does not compile.
 */
export const createTextureTextDrawer = (
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer
): TextureTextDrawer | undefined => {
  const program = linkProgram(gl, TEXTURE_VERTEX_SHADER, TEXTURE_FRAGMENT_SHADER)
  if (!program) return undefined
  const uniforms = readUniforms(gl, program, TEXTURE_UNIFORMS)
  const vertexArray = gl.createVertexArray()
  gl.bindVertexArray(vertexArray)
  bindQuadCorners(gl, quad)
  gl.bindVertexArray(null)
  const textures = createTextTextureCache(gl)

  return {
    viewTarget: { program, uniforms },
    draw: (node, scene, frame) => {
      const devicePixelsPerUnit = scene.viewport.scale * scene.pixelRatio
      const { texture, width, height } = textures.get(node, devicePixelsPerUnit, frame)
      gl.useProgram(program)
      gl.bindVertexArray(vertexArray)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(uniforms.u_texture, 0)
      gl.uniform2f(uniforms.u_center, node.x + node.width / 2, node.y + node.height / 2)
      gl.uniform2f(uniforms.u_nodeHalfSize, node.width / 2, node.height / 2)
      gl.uniform2f(uniforms.u_textureSize, width, height)
      gl.uniform1f(uniforms.u_rotation, (node.rotation * Math.PI) / HALF_TURN_DEGREES)
      gl.uniform1f(uniforms.u_opacity, node.opacity)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT)
    },
    evictUnused: textures.evictUnused,
    dispose: () => {
      textures.dispose()
      gl.deleteVertexArray(vertexArray)
      gl.deleteProgram(program)
    }
  }
}
