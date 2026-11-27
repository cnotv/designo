import { createFontsourceResolver, withUploadedFonts } from '@designo/fonts'
import { getUploadedFonts } from '../../composables/uploadedFonts.ts'
import { fetchFontBytes } from './fetchFontBytes.ts'
import { addBrowserFontFace } from './fontFamilyList.ts'
import { createFontLibrary } from '@designo/text'
import { createFontStore } from '@designo/text'
import { createHarfBuzzShapingFont } from '@designo/text'
import { memoizeFontFamilyResolver } from '@designo/text'
import { createTextEngine } from '@designo/text'
import type { TextRuntime } from '@designo/text'

const runtimeCell: { runtime?: TextRuntime } = {}

const createBrowserFontLibrary = () =>
  createFontLibrary({
    // Uploaded families are looked up outside the memo, so a font uploaded now is found next time.
    resolveFamily: withUploadedFonts(
      getUploadedFonts,
      memoizeFontFamilyResolver(createFontsourceResolver({ fetch: (url) => fetch(url) }))
    ),
    store: createFontStore({
      loadBytes: fetchFontBytes,
      createShapingFont: createHarfBuzzShapingFont,
      onFontLoaded: addBrowserFontFace
    })
  })

/**
 * The fonts and the text engine the whole editor shares, made on first use: the canvas draws with
 * them and the editor measures text with them, so a font loads once and a text is shaped once.
 * Fonts come from the account's uploads, then the Fontsource API, as texts ask for them; none
 * ship with the editor.
 * @returns The library and the engine over it.
 */
export const getSharedTextRuntime = (): TextRuntime => {
  if (runtimeCell.runtime) return runtimeCell.runtime
  const library = createBrowserFontLibrary()
  const runtime = { library, engine: createTextEngine({ library }) }
  runtimeCell.runtime = runtime
  return runtime
}
