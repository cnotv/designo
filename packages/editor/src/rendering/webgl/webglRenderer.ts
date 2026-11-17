import type { DesignNode } from '@designo/core'
import { prepareCanvas } from '../prepareCanvas.ts'
import { SHAPE_INSTANCE_FLOATS, batchScene, packShapeInstances } from '../scene.ts'
import type { Scene, SceneItem, SceneRenderer, ViewUniformTarget } from '../types.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import {
  SHAPE_FRAGMENT_SHADER,
  SHAPE_VERTEX_SHADER,
  TEXTURE_FRAGMENT_SHADER,
  TEXTURE_VERTEX_SHADER
} from './shaders.ts'
import { createTextTextureCache } from './textTextures.ts'

const FLOAT_BYTES = 4
const QUAD_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
const QUAD_VERTEX_COUNT = 4
const STENCIL_MASK = 0xff
const HALF_TURN_DEGREES = 180

// Location, component count and byte offset of each per-instance attribute, matching the
// layout `packShapeInstances` writes and the shape vertex shader reads.
const SHAPE_ATTRIBUTES = [
  { location: 1, size: 4, offset: 0 },
  { location: 2, size: 4, offset: 4 },
  { location: 3, size: 1, offset: 8 },
  { location: 4, size: 4, offset: 9 },
  { location: 5, size: 4, offset: 13 }
] as const

const SHAPE_UNIFORMS = ['u_viewport', 'u_size', 'u_clipPass'] as const
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

const createQuadBuffer = (gl: WebGL2RenderingContext): WebGLBuffer => {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW)
  return buffer
}

const bindQuadCorners = (gl: WebGL2RenderingContext, quad: WebGLBuffer): void => {
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
}

const createShapeVertexArray = (
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer,
  instances: WebGLBuffer
): WebGLVertexArrayObject => {
  const vertexArray = gl.createVertexArray()
  gl.bindVertexArray(vertexArray)
  bindQuadCorners(gl, quad)
  gl.bindBuffer(gl.ARRAY_BUFFER, instances)
  SHAPE_ATTRIBUTES.forEach(({ location, size, offset }) => {
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(
      location,
      size,
      gl.FLOAT,
      false,
      SHAPE_INSTANCE_FLOATS * FLOAT_BYTES,
      offset * FLOAT_BYTES
    )
    gl.vertexAttribDivisor(location, 1)
  })
  gl.bindVertexArray(null)
  return vertexArray
}

const createTextureVertexArray = (
  gl: WebGL2RenderingContext,
  quad: WebGLBuffer
): WebGLVertexArrayObject => {
  const vertexArray = gl.createVertexArray()
  gl.bindVertexArray(vertexArray)
  bindQuadCorners(gl, quad)
  gl.bindVertexArray(null)
  return vertexArray
}

// Both programs place nodes the same way, so both need the same view each frame.
const setViewUniforms = (
  gl: WebGL2RenderingContext,
  scene: Scene,
  targets: readonly ViewUniformTarget[]
): void => {
  const { offsetX, offsetY, scale } = scene.viewport
  targets.forEach(({ program, uniforms }) => {
    gl.useProgram(program)
    gl.uniform3f(uniforms.u_viewport, offsetX, offsetY, scale)
    gl.uniform2f(uniforms.u_size, scene.size.width, scene.size.height)
  })
}

/**
 * Makes the WebGL2 renderer: shapes as instanced quads whose edges a signed distance field draws,
 * frames clipping their contents through the stencil buffer, and text rasterised per node into a
 * cached texture until text gets its own glyph path.
 * @param canvas - The canvas to draw on.
 * @returns The renderer, or undefined where WebGL2 or its shaders are not available.
 */
export const createWebglRenderer = (canvas: HTMLCanvasElement): SceneRenderer | undefined => {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    stencil: true
  })
  if (!gl) return undefined
  const shapeProgram = linkProgram(gl, SHAPE_VERTEX_SHADER, SHAPE_FRAGMENT_SHADER)
  const textureProgram = linkProgram(gl, TEXTURE_VERTEX_SHADER, TEXTURE_FRAGMENT_SHADER)
  if (!shapeProgram || !textureProgram) return undefined

  const shapeUniforms = readUniforms(gl, shapeProgram, SHAPE_UNIFORMS)
  const textureUniforms = readUniforms(gl, textureProgram, TEXTURE_UNIFORMS)
  const quad = createQuadBuffer(gl)
  const instances = gl.createBuffer()
  const shapeVertexArray = createShapeVertexArray(gl, quad, instances)
  const textureVertexArray = createTextureVertexArray(gl, quad)
  const textTextures = createTextTextureCache(gl)
  const state = { frame: 0, clipKey: '' }

  const drawShapes = (nodes: readonly DesignNode[], clipPass: boolean): void => {
    gl.useProgram(shapeProgram)
    gl.uniform1i(shapeUniforms.u_clipPass, clipPass ? 1 : 0)
    gl.bindVertexArray(shapeVertexArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, instances)
    gl.bufferData(gl.ARRAY_BUFFER, packShapeInstances(nodes), gl.DYNAMIC_DRAW)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT, nodes.length)
  }

  // Each frame in the chain adds one to the stencil where it covers what the frames before it
  // left, so only pixels inside every frame reach the full count and get drawn.
  const applyClip = (clipFrames: readonly DesignNode[]): void => {
    const clipKey = clipFrames.map((frame) => frame.id).join('/')
    if (clipKey === state.clipKey) return
    state.clipKey = clipKey
    if (clipFrames.length === 0) {
      gl.disable(gl.STENCIL_TEST)
      return
    }
    gl.enable(gl.STENCIL_TEST)
    gl.clear(gl.STENCIL_BUFFER_BIT)
    gl.colorMask(false, false, false, false)
    clipFrames.forEach((frame, depth) => {
      gl.stencilFunc(gl.EQUAL, depth, STENCIL_MASK)
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR)
      drawShapes([frame], true)
    })
    gl.colorMask(true, true, true, true)
    gl.stencilFunc(gl.EQUAL, clipFrames.length, STENCIL_MASK)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
  }

  const drawText = ({ node }: SceneItem, scene: Scene): void => {
    const devicePixelsPerUnit = scene.viewport.scale * scene.pixelRatio
    const { texture, width, height } = textTextures.get(node, devicePixelsPerUnit, state.frame)
    gl.useProgram(textureProgram)
    gl.bindVertexArray(textureVertexArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(textureUniforms.u_texture, 0)
    gl.uniform2f(textureUniforms.u_center, node.x + node.width / 2, node.y + node.height / 2)
    gl.uniform2f(textureUniforms.u_nodeHalfSize, node.width / 2, node.height / 2)
    gl.uniform2f(textureUniforms.u_textureSize, width, height)
    gl.uniform1f(textureUniforms.u_rotation, (node.rotation * Math.PI) / HALF_TURN_DEGREES)
    gl.uniform1f(textureUniforms.u_opacity, node.opacity)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT)
  }

  const render = (scene: Scene): void => {
    state.frame += 1
    state.clipKey = ''
    const device = prepareCanvas(canvas, scene.size, scene.pixelRatio)
    gl.viewport(0, 0, device.width, device.height)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clearStencil(0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    setViewUniforms(gl, scene, [
      { program: shapeProgram, uniforms: shapeUniforms },
      { program: textureProgram, uniforms: textureUniforms }
    ])
    batchScene(scene.items).forEach((batch) => {
      applyClip(batch.items[0]?.clipFrames ?? [])
      if (batch.kind === 'text') batch.items.forEach((item) => drawText(item, scene))
      else
        drawShapes(
          batch.items.map((item) => item.node),
          false
        )
    })
    gl.bindVertexArray(null)
    textTextures.evictUnused(state.frame)
  }

  const dispose = (): void => {
    textTextures.dispose()
    gl.deleteVertexArray(shapeVertexArray)
    gl.deleteVertexArray(textureVertexArray)
    gl.deleteBuffer(quad)
    gl.deleteBuffer(instances)
    gl.deleteProgram(shapeProgram)
    gl.deleteProgram(textureProgram)
  }

  return { kind: 'webgl2', render, dispose }
}
