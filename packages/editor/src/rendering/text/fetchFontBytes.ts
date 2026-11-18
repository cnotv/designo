import type { FontBytesLoader } from './types.ts'

/**
 * Fetches a bundled font from the app's own origin, relative to the base URL the app is served
 * from (`public/fonts/` in the editor package).
 * @param url - The font's catalog URL, such as `fonts/Inter-Regular.subset.ttf`.
 * @returns The file's bytes.
 */
export const fetchFontBytes: FontBytesLoader = async (url) => {
  const response = await fetch(`${import.meta.env.BASE_URL}${url}`)
  if (!response.ok) throw new Error(`Could not load font ${url}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}
