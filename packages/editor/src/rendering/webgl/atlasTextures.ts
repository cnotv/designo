import type { GlyphAtlas } from '../text/types.ts'

/** The atlas's pages as GPU textures, kept in step with what the atlas has placed and evicted. */
export interface AtlasTextures {
  /** Applies the evictions and uploads the atlas has queued, once. */
  applyChanges: () => void
  /** Binds a page's texture to the active texture unit. */
  bindPage: (pageIndex: number) => void
  dispose: () => void
}

const createPageTexture = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number
): WebGLTexture => {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  // Allocated zeroed, so a page's empty texels read as no coverage.
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, width, height)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

/**
 * Makes the textures for an atlas's pages, which it creates as pages appear. Coverage is one
 * byte a pixel, so a page of 2048 by 2048 is 4 MB.
 * @param gl - The WebGL2 context.
 * @param atlas - The atlas whose queued evictions and uploads this applies.
 * @returns The textures.
 */
export const createAtlasTextures = (
  gl: WebGL2RenderingContext,
  atlas: Pick<GlyphAtlas, 'pageWidth' | 'pageHeight' | 'takeClearedPages' | 'takePendingUploads'>
): AtlasTextures => {
  const pageTextures: WebGLTexture[] = []
  const emptyPage = { pixels: undefined as Uint8Array | undefined }

  const getPageTexture = (pageIndex: number): WebGLTexture => {
    const existing = pageTextures[pageIndex]
    if (existing) return existing
    const created = createPageTexture(gl, atlas.pageWidth, atlas.pageHeight)
    pageTextures[pageIndex] = created
    return created
  }

  const clearPage = (pageIndex: number): void => {
    emptyPage.pixels ??= new Uint8Array(atlas.pageWidth * atlas.pageHeight)
    gl.bindTexture(gl.TEXTURE_2D, getPageTexture(pageIndex))
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      atlas.pageWidth,
      atlas.pageHeight,
      gl.RED,
      gl.UNSIGNED_BYTE,
      emptyPage.pixels
    )
  }

  return {
    // Cleared pages first: an upload after an eviction belongs to the glyphs that replaced it.
    applyChanges: () => {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      atlas.takeClearedPages().forEach(clearPage)
      atlas.takePendingUploads().forEach(({ pageIndex, rectangle, pixels }) => {
        gl.bindTexture(gl.TEXTURE_2D, getPageTexture(pageIndex))
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height,
          gl.RED,
          gl.UNSIGNED_BYTE,
          pixels
        )
      })
    },
    bindPage: (pageIndex) => gl.bindTexture(gl.TEXTURE_2D, getPageTexture(pageIndex)),
    dispose: () => pageTextures.forEach((texture) => gl.deleteTexture(texture))
  }
}
