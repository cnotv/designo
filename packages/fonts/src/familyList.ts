import { fontsourceFamilyListSchema } from '@designo/storage/schemas'
import type { FontsourceFamilySummary } from '@designo/storage'
import type { FontFetch } from './types.ts'

/** The Fontsource API's list of every Google font family, about half a megabyte. */
export const FONTSOURCE_FAMILY_LIST_URL = 'https://api.fontsource.org/v1/fonts?type=google'

/**
 * Loads the names of the families a font picker offers.
 * @param fetch - How to fetch a URL.
 * @param url - The list endpoint.
 * @returns The families, sorted by name.
 */
export const loadFontFamilyList = async (
  fetch: FontFetch,
  url = FONTSOURCE_FAMILY_LIST_URL
): Promise<FontsourceFamilySummary[]> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The font API answered ${response.status} for its family list`)
  return fontsourceFamilyListSchema
    .parse(await response.json())
    .toSorted((left, right) => left.family.localeCompare(right.family))
}
