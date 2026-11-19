import { listFontCandidates, type TextFace } from '@designo/core'
import type { FontFamilyFiles, ResolveFontFamily } from './types.ts'

/**
 * Looks up every family a text could be drawn with, in the order they are preferred: what the
 * node names, its stand-ins, then the fallbacks. Families the font API lacks are left out.
 * @param face - The node's `fontFamily` list, weight and style.
 * @param resolve - The family lookup.
 * @returns The families found; the first one draws the text.
 */
export const resolveFontFamilies = async (
  face: TextFace,
  resolve: ResolveFontFamily
): Promise<FontFamilyFiles[]> => {
  const found = await Promise.all(
    listFontCandidates(face.fontFamily).map((family) => resolve(family, face))
  )
  return found.filter((family) => family !== undefined)
}
