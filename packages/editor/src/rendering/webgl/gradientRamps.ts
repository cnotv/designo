import type { Gradient } from '@designo/core'
import { RAMP_WIDTH, bakeGradientRamp } from '../gradientRamp.ts'

/** How many different gradients one frame can draw; a further one reuses the oldest row. */
export const RAMP_ROWS = 128

/** The texture holding every gradient's baked colours, one per row. */
export interface GradientRamps {
  /** The row holding a gradient, baking and uploading it the first time it is asked for. */
  rowOf: (gradient: Gradient) => number
  bind: (unit: number) => void
  dispose: () => void
}

/**
 * Makes the ramp texture the shape shader looks gradient colours up in.
 * @param gl - The WebGL2 context.
 * @returns The ramps.
 */
export const createGradientRamps = (gl: WebGL2RenderingContext): GradientRamps => {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    RAMP_WIDTH,
    RAMP_ROWS,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const rows = new Map<string, number>()
  const state = { nextRow: 0 }

  return {
    rowOf: (gradient) => {
      const key = JSON.stringify(gradient.stops)
      const known = rows.get(key)
      if (known !== undefined) return known
      // ponytail: round-robin reuse; a frame with more than RAMP_ROWS distinct gradients repaints
      // the oldest wrongly. Raise RAMP_ROWS, or evict by use, if a document ever needs it.
      const row = state.nextRow
      state.nextRow = (row + 1) % RAMP_ROWS
      rows.forEach((existingRow, existingKey) => {
        if (existingRow === row) rows.delete(existingKey)
      })
      rows.set(key, row)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        row,
        RAMP_WIDTH,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bakeGradientRamp(gradient)
      )
      return row
    },
    bind: (unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    },
    dispose: () => gl.deleteTexture(texture)
  }
}
