import { getImagePlacement, type DesignNode } from '@designo/core'
import { getLoadedImage } from '../imageCache.ts'
import type { ViewUniformTarget } from '../types.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import { QUAD_VERTEX_COUNT, bindQuadCorners } from './glQuad.ts'
import { TEXTURE_FRAGMENT_SHADER, TEXTURE_VERTEX_SHADER } from './shaders.ts'

const HALF_TURN_DEGREES = 180

const IMAGE_UNIFORMS = [
  'u_viewport',
  'u_size',
  'u_center',
  'u_nodeHalfSize',
  'u_textureSize',
  'u_textureOffset',
  'u_uvCrop',
  'u_rotation',
  'u_opacity',
  'u_texture'
] as const

/** Draws image nodes as textured quads, placed in their boxes as their `imageFit` says. */
export interface ImageDrawer {
  viewTarget: ViewUniformTarget
  /** Draws the node's picture; false when it has none to draw yet, so the caller draws its fill. */
  draw: (node: DesignNode) => boolean
  dispose: () => void
}

const uploadPicture = (gl: WebGL2RenderingContext, bitmap: ImageBitmap): WebGLTexture => {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  // A picture is usually drawn smaller than it is, which mipmaps keep from shimmering.
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

/**
 * Makes the path that draws an image node from a texture of its picture, which the same textured
 * quad program as text takes, with the texture sized to the node's box.
 * @param gl - The WebGL2 context.
 * @param quad - The shared unit quad's vertex buffer.
 * @returns The drawer, or undefined where its program does not compile.
 */
export const createImageDrawer = (
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer
): ImageDrawer | undefined => {
  const program = linkProgram(gl, TEXTURE_VERTEX_SHADER, TEXTURE_FRAGMENT_SHADER)
  if (!program) return undefined
  const uniforms = readUniforms(gl, program, IMAGE_UNIFORMS)
  const vertexArray = gl.createVertexArray()
  gl.bindVertexArray(vertexArray)
  bindQuadCorners(gl, quad)
  gl.bindVertexArray(null)
  const textures = new Map<string, WebGLTexture>()

  const textureFor = (assetId: string): WebGLTexture | undefined => {
    const cached = textures.get(assetId)
    if (cached) return cached
    const bitmap = getLoadedImage(assetId)
    if (!bitmap) return undefined
    const texture = uploadPicture(gl, bitmap)
    textures.set(assetId, texture)
    return texture
  }

  return {
    viewTarget: { program, uniforms },
    draw: (node) => {
      const bitmap = node.imageAsset ? getLoadedImage(node.imageAsset) : undefined
      const texture = node.imageAsset ? textureFor(node.imageAsset) : undefined
      if (!bitmap || !texture) return false
      const placement = getImagePlacement(node, bitmap, node.imageFit)
      // A fill picture is larger than the box, so the quad stays the box and the texture is cropped.
      const visible = {
        x: Math.max(0, placement.x),
        y: Math.max(0, placement.y),
        width: Math.min(node.width, placement.width),
        height: Math.min(node.height, placement.height)
      }
      gl.useProgram(program)
      gl.bindVertexArray(vertexArray)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(uniforms.u_texture, 0)
      gl.uniform2f(uniforms.u_center, node.x + node.width / 2, node.y + node.height / 2)
      gl.uniform2f(uniforms.u_nodeHalfSize, node.width / 2, node.height / 2)
      gl.uniform2f(uniforms.u_textureSize, visible.width, visible.height)
      gl.uniform2f(uniforms.u_textureOffset, visible.x, visible.y)
      gl.uniform2f(
        uniforms.u_uvCrop,
        1 - visible.width / placement.width,
        1 - visible.height / placement.height
      )
      gl.uniform1f(uniforms.u_rotation, (node.rotation * Math.PI) / HALF_TURN_DEGREES)
      gl.uniform1f(uniforms.u_opacity, node.opacity)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT)
      return true
    },
    dispose: () => {
      textures.forEach((texture) => gl.deleteTexture(texture))
      gl.deleteVertexArray(vertexArray)
      gl.deleteProgram(program)
    }
  }
}
