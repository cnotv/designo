const QUAD_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])

/** The vertex count of the unit quad every program draws as a triangle strip. */
export const QUAD_VERTEX_COUNT = 4

/**
 * Uploads the unit quad's corners, which each program scales and places its own way.
 * @param gl - The WebGL2 context.
 * @returns The buffer.
 */
export const createQuadBuffer = (gl: WebGL2RenderingContext): WebGLBuffer => {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW)
  return buffer
}

/**
 * Points attribute 0 at the quad's corners, in the vertex array being set up.
 * @param gl - The WebGL2 context.
 * @param quad - The buffer from `createQuadBuffer`.
 */
export const bindQuadCorners = (gl: WebGL2RenderingContext, quad: WebGLBuffer): void => {
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
}
