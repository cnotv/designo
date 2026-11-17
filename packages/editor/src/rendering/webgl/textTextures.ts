import type { DesignNode } from '@designo/core'
import { paintText } from '../canvas2dRenderer.ts'
import type { TextTexture, TextTextureCache } from '../types.ts'
import {
  bucketRasterScale,
  capRasterScale,
  measureTextRaster,
  textRasterKey
} from './textRaster.ts'

// Textures for text no longer on screen are dropped once the cache grows past this.
const TEXT_CACHE_LIMIT = 256

const measureWidestLine = (node: DesignNode): number => {
  const context = new OffscreenCanvas(1, 1).getContext('2d')
  if (!context) return node.width
  context.font = `${node.fontSize}px ${node.fontFamily}`
  return Math.max(...node.text.split('\n').map((line) => context.measureText(line).width))
}

const uploadText = (
  gl: WebGL2RenderingContext,
  node: DesignNode,
  bucket: number
): Omit<TextTexture, 'lastFrame'> => {
  const size = measureTextRaster(node, measureWidestLine(node))
  const rasterScale = capRasterScale(bucket, size)
  const raster = new OffscreenCanvas(
    Math.max(1, Math.ceil(size.width * rasterScale)),
    Math.max(1, Math.ceil(size.height * rasterScale))
  )
  const context = raster.getContext('2d')
  context?.scale(rasterScale, rasterScale)
  if (context) paintText(context, node)
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, raster)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return { texture, width: size.width, height: size.height }
}

/**
 * Keeps one texture per distinct text raster, so the same words at the same zoom bucket are
 * drawn from the GPU without rasterising again.
 * @param gl - The WebGL2 context the textures belong to.
 * @returns The cache.
 */
export const createTextTextureCache = (gl: WebGL2RenderingContext): TextTextureCache => {
  const textures = new Map<string, TextTexture>()
  return {
    get: (node, devicePixelsPerUnit, frame) => {
      const bucket = bucketRasterScale(devicePixelsPerUnit)
      const key = textRasterKey(node, bucket)
      const cached = textures.get(key)
      if (cached) {
        cached.lastFrame = frame
        return cached
      }
      const entry = { ...uploadText(gl, node, bucket), lastFrame: frame }
      textures.set(key, entry)
      return entry
    },
    evictUnused: (frame) => {
      if (textures.size <= TEXT_CACHE_LIMIT) return
      textures.forEach((entry, key) => {
        if (entry.lastFrame === frame) return
        gl.deleteTexture(entry.texture)
        textures.delete(key)
      })
    },
    dispose: () => {
      textures.forEach((entry) => gl.deleteTexture(entry.texture))
      textures.clear()
    }
  }
}
