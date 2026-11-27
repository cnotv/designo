import { listFontCandidates, type TextFace } from '@designo/core'
import type { FontFamilyFiles, ResolveFontFamily } from './types.ts'

/**
 * Looks up every family a text could be drawn with, in the order they are preferred: what the
 * node names, its stand-ins, then the fallbacks. Families the font API lacks are left out.
 * @param face - The node's `fontFamily` list, weight and style.
 * @param resolve - The family lookup.
 * @returns The families found; the first one draws the text.
 * @throws {Error} When a lookup failed before any family was found, so the text would be drawn with a
 * family other than the one it asks for.
 */
export const resolveFontFamilies = async (
  face: TextFace,
  resolve: ResolveFontFamily
): Promise<FontFamilyFiles[]> => {
  // Waits for every lookup before reporting a failure: Promise.all would return at the first
  // rejection and leave the others writing to the font cache after the caller thinks it is done.
  const settled = await Promise.allSettled(
    listFontCandidates(face.fontFamily).map((family) => resolve(family, face))
  )
  // A failed lookup only matters while no family before it was found: once the text has a family
  // to draw with, as an uploaded one with the font API out of reach, a lost fallback costs only
  // the scripts it would have covered.
  const firstFound = settled.findIndex(
    (result) => result.status === 'fulfilled' && result.value !== undefined
  )
  const deciding = firstFound === -1 ? settled : settled.slice(0, firstFound)
  const failure = deciding.find((result) => result.status === 'rejected')
  if (failure) throw failure.reason
  return settled.flatMap((result) =>
    result.status === 'fulfilled' && result.value !== undefined ? [result.value] : []
  )
}
