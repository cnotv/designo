import type { DesignNode } from '@designo/core'
import { prepareCanvas } from '../prepareCanvas.ts'
import { SHAPE_INSTANCE_FLOATS, batchScene, packShapeInstances } from '../scene.ts'
import type { TextRuntime } from '../text/types.ts'
import type { Scene, SceneItem, SceneRenderer, TextDrawView, ViewUniformTarget } from '../types.ts'
import { linkProgram, readUniforms } from './glPrograms.ts'
import { SHAPE_FRAGMENT_SHADER, SHAPE_VERTEX_SHADER } from './shaders.ts'
import { createGlyphPipeline } from './glyphPipeline.ts'
import { QUAD_VERTEX_COUNT, bindQuadCorners, createQuadBuffer } from './glQuad.ts'
import { createTextureTextDrawer } from './textureTextDrawer.ts'

const FLOAT_BYTES = 4
const STENCIL_MASK = 0xff

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

const toTextDrawView = ({ viewport, pixelRatio }: Scene): TextDrawView => ({
  devicePixelsPerUnit: viewport.scale * pixelRatio,
  deviceOffsetX: viewport.offsetX * pixelRatio,
  deviceOffsetY: viewport.offsetY * pixelRatio
})

/**
 * Makes the WebGL2 renderer: shapes as instanced quads whose edges a signed distance field draws,
 * frames clipping their contents through the stencil buffer, and text as instanced glyph quads
 * from a shared atlas. A text the glyph path cannot draw yet (its fonts are still loading), or at
 * all (a character no bundled font has, a size past what the atlas rasterises sharply, a glyph
 * that does not fit), is rasterised by Canvas 2D into a cached texture of its own.
 * @param canvas - The canvas to draw on.
 * @param textRuntime - The fonts and text engine for the glyph path; without them every text
 * takes the Canvas 2D texture path.
 * @returns The renderer, or undefined where WebGL2 or its shaders are not available.
 */
export const createWebglRenderer = (
  canvas: HTMLCanvasElement,
  textRuntime?: TextRuntime
): SceneRenderer | undefined => {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    stencil: true
  })
  if (!gl) return undefined
  const shapeProgram = linkProgram(gl, SHAPE_VERTEX_SHADER, SHAPE_FRAGMENT_SHADER)
  if (!shapeProgram) return undefined

  const shapeUniforms = readUniforms(gl, shapeProgram, SHAPE_UNIFORMS)
  const quad = createQuadBuffer(gl)
  const textureText = createTextureTextDrawer(gl, quad)
  if (!textureText) return undefined
  const instances = gl.createBuffer()
  const shapeVertexArray = createShapeVertexArray(gl, quad, instances)
  const glyphPipeline = textRuntime ? createGlyphPipeline(gl, textRuntime) : undefined
  const state = { frame: 0, clipKey: '' }
  const viewTargets: ViewUniformTarget[] = [
    { program: shapeProgram, uniforms: shapeUniforms },
    textureText.viewTarget,
    ...(glyphPipeline ? [glyphPipeline.viewTarget] : [])
  ]

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

  const drawTexts = (items: readonly SceneItem[], scene: Scene): void => {
    if (glyphPipeline) {
      glyphPipeline.drawTexts(items, toTextDrawView(scene), (node) =>
        textureText.draw(node, scene, state.frame)
      )
      return
    }
    items.forEach(({ node }) => textureText.draw(node, scene, state.frame))
  }

  const render = (scene: Scene): void => {
    state.frame += 1
    state.clipKey = ''
    glyphPipeline?.beginFrame()
    const device = prepareCanvas(canvas, scene.size, scene.pixelRatio)
    gl.viewport(0, 0, device.width, device.height)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clearStencil(0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    setViewUniforms(gl, scene, viewTargets)
    batchScene(scene.items).forEach((batch) => {
      applyClip(batch.items[0]?.clipFrames ?? [])
      if (batch.kind === 'text') drawTexts(batch.items, scene)
      else
        drawShapes(
          batch.items.map((item) => item.node),
          false
        )
    })
    gl.bindVertexArray(null)
    textureText.evictUnused(state.frame)
  }

  const dispose = (): void => {
    textureText.dispose()
    glyphPipeline?.dispose()
    gl.deleteVertexArray(shapeVertexArray)
    gl.deleteBuffer(quad)
    gl.deleteBuffer(instances)
    gl.deleteProgram(shapeProgram)
  }

  return { kind: 'webgl2', render, dispose, getTextStats: () => glyphPipeline?.getStats() }
}
