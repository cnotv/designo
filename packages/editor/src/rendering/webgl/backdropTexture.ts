/** A copy of what is already painted, which a blended shape reads to mix with. */
export interface BackdropTexture {
  /** Copies the canvas as it is now and binds the copy to the texture unit. */
  capture: (unit: number, width: number, height: number) => void
  dispose: () => void
}

/**
 * Makes the texture a blend mode samples. WebGL2 cannot read the framebuffer in a shader, so a
 * shape with a blend mode is drawn alone, after a copy of the canvas up to it.
 * @param gl - The WebGL2 context.
 * @returns The backdrop texture.
 */
export const createBackdropTexture = (gl: WebGL2RenderingContext): BackdropTexture => {
  const texture = gl.createTexture()
  const size = { width: 0, height: 0 }
  return {
    capture: (unit, width, height) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (size.width !== width || size.height !== height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        size.width = width
        size.height = height
      }
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height)
    },
    dispose: () => gl.deleteTexture(texture)
  }
}
