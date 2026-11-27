import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFontsourceResolver, withUploadedFonts } from '@designo/fonts'
import {
  createFontLibrary,
  createFontStore,
  createHarfBuzzShapingFont,
  createTextEngine,
  loadTextLayout,
  memoizeFontFamilyResolver
} from '@designo/text'
import {
  cacheKey,
  createCachingFetch,
  fetchFontBytes,
  fetchWithTimeout,
  readLocalOrFetch,
  writeAtomically
} from './fontNetwork.ts'
import { DEFAULT_FONT_CACHE_DIRECTORY } from './screenshotFonts.ts'
import type { LayoutText, NodeLayoutText, TextLayoutFetchers } from './types.ts'

// Font files the layout reads are kept apart from the renamed copies a screenshot draws with, which
// HarfBuzz would shape with another family name.
const FILE_CACHE_FOLDER = 'layout'

const createCachingBytesLoader =
  (directory: string, fetchBytes: (url: string) => Promise<Uint8Array>) =>
  async (url: string): Promise<Uint8Array> => {
    const path = join(directory, FILE_CACHE_FOLDER, `${cacheKey(url)}.font`)
    const cached = await readFile(path).catch(() => undefined)
    if (cached) return new Uint8Array(cached)
    const bytes = await fetchBytes(url)
    await mkdir(join(directory, FILE_CACHE_FOLDER), { recursive: true })
    await writeAtomically(path, bytes)
    return bytes
  }

/**
 * Makes the text layout the MCP server wraps and measures text with. It is the editor's engine,
 * fed fonts from the Fontsource API through a disk cache, so a line breaks where the canvas
 * breaks it. An account's uploaded fonts come first, read from its own store.
 * @param options - How to fetch, where the API's answers and the font files are kept between
 *   calls (the network and a folder in the system's temporary folder by default), and the
 *   account's uploaded fonts.
 * @returns A function that lays one text out, or answers undefined when it cannot.
 */
export const createNodeLayoutText = ({
  fetchJson = fetchWithTimeout,
  fetchBytes = fetchFontBytes,
  cacheDirectory = DEFAULT_FONT_CACHE_DIRECTORY,
  uploadedFonts = []
}: TextLayoutFetchers = {}): NodeLayoutText => {
  const cachingFetch = createCachingFetch(fetchJson, cacheDirectory)
  const cachingBytes = createCachingBytesLoader(cacheDirectory, fetchBytes)
  const library = createFontLibrary({
    resolveFamily: withUploadedFonts(
      () => Promise.resolve(uploadedFonts),
      memoizeFontFamilyResolver(
        createFontsourceResolver({
          // The cache folder may not exist yet, and a failed write would lose the whole layout.
          fetch: async (url) => {
            await mkdir(cacheDirectory, { recursive: true })
            return cachingFetch(url)
          }
        })
      )
    ),
    store: createFontStore({
      // An uploaded font is read from the account's store, never copied into the cache.
      loadBytes: readLocalOrFetch(cachingBytes),
      createShapingFont: createHarfBuzzShapingFont
    })
  })
  const runtime = { library, engine: createTextEngine({ library }) }
  return Object.assign((request: Parameters<LayoutText>[0]) => loadTextLayout(runtime, request), {
    getFontBytes: library.getFontBytes,
    getGlyphOutline: (fontId: string, glyphId: number) =>
      library.getFont(fontId)?.getGlyphOutline(glyphId)
  })
}

/** The layout `get_screenshot`, `export_svg` and `measure_text` use unless a host replaces it. */
export const layoutTextWithFontsourceFonts: NodeLayoutText = createNodeLayoutText()
