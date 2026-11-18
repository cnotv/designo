import type { DesignNode } from '@designo/core'
import { packShapeInstances } from '../scene.ts'
import type { BackdropTexture } from './backdropTexture.ts'
import type { GradientRamps } from './gradientRamps.ts'
import { QUAD_VERTEX_COUNT } from './glQuad.ts'

export const SHAPE_UNIFORMS = [
  'u_viewport',
  'u_size',
  'u_clipPass',
  'u_ramps',
  'u_backdrop',
  'u_deviceSize',
  'u_rampRows'
] as const

// Texture units the text paths do not use, so binding these never disturbs them.
const RAMP_UNIT = 4
const BACKDROP_UNIT = 5

interface ShapeDrawerInput {
  gl: WebGL2RenderingContext
  program: WebGLProgram
  uniforms: Record<(typeof SHAPE_UNIFORMS)[number], WebGLUniformLocation | null>
  vertexArray: WebGLVertexArrayObject
  instances: WebGLBuffer
  ramps: GradientRamps
  backdrop: BackdropTexture
}

/** The two ways the shape program draws: a run of shapes at once, or one against a backdrop copy. */
export interface ShapeDrawer {
  drawShapes: (nodes: readonly DesignNode[], clipPass: boolean) => void
  drawBlendedShape: (node: DesignNode, device: { width: number; height: number }) => void
}

/**
 * Makes the functions that draw shapes with the shape program.
 * @param input - The context, program, its inputs and the textures it reads.
 * @returns The drawer.
 */
export const createShapeDrawer = ({
  gl,
  program,
  uniforms,
  vertexArray,
  instances,
  ramps,
  backdrop
}: ShapeDrawerInput): ShapeDrawer => {
  const drawShapes = (nodes: readonly DesignNode[], clipPass: boolean): void => {
    gl.useProgram(program)
    gl.uniform1i(uniforms.u_clipPass, clipPass ? 1 : 0)
    // Packing bakes any gradient not seen before into the ramp texture.
    const packed = packShapeInstances(nodes, ramps.rowOf)
    ramps.bind(RAMP_UNIT)
    gl.uniform1i(uniforms.u_ramps, RAMP_UNIT)
    gl.bindVertexArray(vertexArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, instances)
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.DYNAMIC_DRAW)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT, nodes.length)
  }

  // The shader writes the whole blended result, so the fixed blend is off for this one shape.
  const drawBlendedShape: ShapeDrawer['drawBlendedShape'] = (node, device) => {
    backdrop.capture(BACKDROP_UNIT, device.width, device.height)
    gl.useProgram(program)
    gl.uniform1i(uniforms.u_backdrop, BACKDROP_UNIT)
    gl.disable(gl.BLEND)
    drawShapes([node], false)
    gl.enable(gl.BLEND)
  }

  return { drawShapes, drawBlendedShape }
}
