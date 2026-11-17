const compileShader = (
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string
): WebGLShader | undefined => {
  const shader = gl.createShader(type)
  if (!shader) return undefined
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.warn('Designo: a WebGL2 shader did not compile', gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
  return undefined
}

/**
 * Compiles and links a shader program.
 * @param gl - The WebGL2 context.
 * @param vertexSource - The vertex shader's GLSL.
 * @param fragmentSource - The fragment shader's GLSL.
 * @returns The program, or undefined when the GPU refuses it, which falls back to Canvas 2D.
 */
export const linkProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram | undefined => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertexShader || !fragmentShader) return undefined
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  console.warn('Designo: a WebGL2 program did not link', gl.getProgramInfoLog(program))
  gl.deleteProgram(program)
  return undefined
}

/**
 * Reads a uniform's location, which every draw needs and none should look up per frame.
 * @param gl - The WebGL2 context.
 * @param program - The program.
 * @param names - The uniform names.
 * @returns Each name's location; null where the compiler removed an unused uniform.
 */
export const readUniforms = <Name extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly Name[]
): Record<Name, WebGLUniformLocation | null> =>
  Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
    Name,
    WebGLUniformLocation | null
  >
