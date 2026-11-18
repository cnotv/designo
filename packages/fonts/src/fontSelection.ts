import { listFontCandidates } from '@designo/core'
import type { FontFamilyFiles, ResolveFontFamily } from './types.ts'

/**
 * Looks up every family a text could be drawn with, in the order they are preferred: what the
 * node names, its stand-ins, then the fallbacks. Families the font API lacks are left out.
 * @param list - The node's `fontFamily`.
 * @param resolve - The family lookup.
 * @returns The families found; the first one draws the text.
 */
export const resolveFontFamilies = async (
  list: string,
  resolve: ResolveFontFamily
): Promise<FontFamilyFiles[]> => {
  const found = await Promise.all(listFontCandidates(list).map(resolve))
  return found.filter((family) => family !== undefined)
}
