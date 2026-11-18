import type { FontBytesLoader } from './types.ts'

/**
 * Fetches a font file from the font API's file host.
 * @param url - The file's address, as the font API gave it.
 * @returns The file's bytes.
 */
export const fetchFontBytes: FontBytesLoader = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load font ${url}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}
