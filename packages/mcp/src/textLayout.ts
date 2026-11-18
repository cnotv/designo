import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createFontsourceResolver } from '@designo/fonts'
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
  writeAtomically
} from './fontNetwork.ts'
import { DEFAULT_FONT_CACHE_DIRECTORY } from './screenshotFonts.ts'
import type { LayoutText, TextLayoutFetchers } from './types.ts'

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
 * breaks it.
 * @param options - How to fetch, and where the API's answers and the font files are kept between
 *   calls; the network and a folder in the system's temporary folder by default.
 * @returns A function that lays one text out, or answers undefined when it cannot.
 */
export const createNodeLayoutText = ({
  fetchJson = fetchWithTimeout,
  fetchBytes = fetchFontBytes,
  cacheDirectory = DEFAULT_FONT_CACHE_DIRECTORY
}: TextLayoutFetchers = {}): LayoutText => {
  const cachingFetch = createCachingFetch(fetchJson, cacheDirectory)
  const library = createFontLibrary({
    resolveFamily: memoizeFontFamilyResolver(
      createFontsourceResolver({
        // The cache folder may not exist yet, and a failed write would lose the whole layout.
        fetch: async (url) => {
          await mkdir(cacheDirectory, { recursive: true })
          return cachingFetch(url)
        }
      })
    ),
    store: createFontStore({
      loadBytes: createCachingBytesLoader(cacheDirectory, fetchBytes),
      createShapingFont: createHarfBuzzShapingFont
    })
  })
  const runtime = { library, engine: createTextEngine({ library }) }
  return (request) => loadTextLayout(runtime, request)
}

/** The layout `get_screenshot`, `export_svg` and `measure_text` use unless a host replaces it. */
export const layoutTextWithFontsourceFonts: LayoutText = createNodeLayoutText()
