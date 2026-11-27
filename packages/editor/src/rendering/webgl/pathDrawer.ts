import type { DesignNode } from '@designo/core'
import type { Scene, ViewUniformTarget } from '../types.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import { QUAD_VERTEX_COUNT, bindQuadCorners } from './glQuad.ts'
import { getPathRasterPadding, pathRasterKey } from './pathRaster.ts'
import { TEXTURE_FRAGMENT_SHADER, TEXTURE_VERTEX_SHADER } from './shaders.ts'
import { bucketRasterScale, capRasterScale } from './textRaster.ts'

const HALF_TURN_DEGREES = 180
// Textures for paths no longer on screen are dropped once the cache grows past this.
const PATH_CACHE_LIMIT = 128

const PATH_UNIFORMS = [
  'u_viewport',
  'u_size',
  'u_center',
  'u_nodeHalfSize',
  'u_textureSize',
  'u_textureOffset',
  'u_rotation',
  'u_opacity',
  'u_texture'
] as const

interface PathTexture {
  texture: WebGLTexture
  lastFrame: number
}

/** Draws path nodes as textured quads, from a texture Canvas 2D rasterised for each outline. */
export interface PathDrawer {
  viewTarget: ViewUniformTarget
  draw: (node: DesignNode, scene: Scene, frame: number) => void
  /** Drops the textures not used this frame, once the cache has grown past its limit. */
  evictUnused: (frame: number) => void
  dispose: () => void
}

const rasterisePath = (node: DesignNode, scale: number, padding: number): OffscreenCanvas => {
  const raster = new OffscreenCanvas(
    Math.max(1, Math.ceil((node.width + padding * 2) * scale)),
    Math.max(1, Math.ceil((node.height + padding * 2) * scale))
  )
  const context = raster.getContext('2d')
  if (!context) return raster
  context.scale(scale, scale)
  context.translate(padding, padding)
  const outline = new Path2D(node.pathData)
  if (node.fill) {
    context.fillStyle = node.fill
    context.fill(outline)
  }
  if (node.stroke && node.strokeWidth > 0) {
    context.strokeStyle = node.stroke
    context.lineWidth = node.strokeWidth
    context.stroke(outline)
  }
  return raster
}

const uploadPath = (gl: WebGL2RenderingContext, node: DesignNode, bucket: number): WebGLTexture => {
  const padding = getPathRasterPadding(node)
  const size = { width: node.width + padding * 2, height: node.height + padding * 2 }
  const raster = rasterisePath(node, capRasterScale(bucket, size), padding)
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

/**
 * Makes the path that draws a path node as one textured quad. WebGL has no curves of its own, so
 * Canvas 2D fills and strokes the outline into a texture at the zoom's power of two, which is
 * reused until the zoom crosses the next one.
 * @param gl - The WebGL2 context.
 * @param quad - The shared unit quad's vertex buffer.
 * @returns The drawer, or undefined where its program does not compile.
 */
export const createPathDrawer = (
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer
): PathDrawer | undefined => {
  const program = linkProgram(gl, TEXTURE_VERTEX_SHADER, TEXTURE_FRAGMENT_SHADER)
  if (!program) return undefined
  const uniforms = readUniforms(gl, program, PATH_UNIFORMS)
  const vertexArray = gl.createVertexArray()
  gl.bindVertexArray(vertexArray)
  bindQuadCorners(gl, quad)
  gl.bindVertexArray(null)
  const textures = new Map<string, PathTexture>()

  const textureFor = (
    node: DesignNode,
    devicePixelsPerUnit: number,
    frame: number
  ): WebGLTexture => {
    const bucket = bucketRasterScale(devicePixelsPerUnit)
    const key = pathRasterKey(node, bucket)
    const cached = textures.get(key)
    if (cached) {
      cached.lastFrame = frame
      return cached.texture
    }
    const texture = uploadPath(gl, node, bucket)
    textures.set(key, { texture, lastFrame: frame })
    return texture
  }

  return {
    viewTarget: { program, uniforms },
    draw: (node, scene, frame) => {
      const padding = getPathRasterPadding(node)
      gl.useProgram(program)
      gl.bindVertexArray(vertexArray)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(
        gl.TEXTURE_2D,
        textureFor(node, scene.viewport.scale * scene.pixelRatio, frame)
      )
      gl.uniform1i(uniforms.u_texture, 0)
      gl.uniform2f(uniforms.u_center, node.x + node.width / 2, node.y + node.height / 2)
      gl.uniform2f(uniforms.u_nodeHalfSize, node.width / 2, node.height / 2)
      gl.uniform2f(uniforms.u_textureSize, node.width + padding * 2, node.height + padding * 2)
      gl.uniform2f(uniforms.u_textureOffset, -padding, -padding)
      gl.uniform1f(uniforms.u_rotation, (node.rotation * Math.PI) / HALF_TURN_DEGREES)
      gl.uniform1f(uniforms.u_opacity, node.opacity)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT)
    },
    evictUnused: (frame) => {
      if (textures.size <= PATH_CACHE_LIMIT) return
      textures.forEach((entry, key) => {
        if (entry.lastFrame === frame) return
        gl.deleteTexture(entry.texture)
        textures.delete(key)
      })
    },
    dispose: () => {
      textures.forEach((entry) => gl.deleteTexture(entry.texture))
      textures.clear()
      gl.deleteVertexArray(vertexArray)
      gl.deleteProgram(program)
    }
  }
}
