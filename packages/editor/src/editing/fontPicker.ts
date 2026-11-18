import { parseFontFamilyList } from '@designo/core'
import type { FontsourceFamilySummary } from '@designo/storage'

/** How many families the picker draws at once; the list has about two thousand. */
export const MAX_PICKER_FAMILIES = 60

// The generic family written after a picked one, so a renderer without the font still draws a face
// of the right kind. Display and handwriting have no generic the font API's fallbacks use.
const GENERIC_BY_CATEGORY: Readonly<Record<string, string>> = {
  serif: 'serif',
  'sans-serif': 'sans-serif',
  monospace: 'monospace',
  handwriting: 'cursive',
  display: 'sans-serif'
}

const NEEDS_QUOTES = /[^\w -]|^\d/

/**
 * Finds the families a search matches, those starting with the words first.
 * @param families - Every family, sorted by name.
 * @param query - What was typed; empty lists the first families.
 * @param limit - The most to return.
 * @returns The matches, at most `limit`.
 */
export const findFontFamilies = (
  families: readonly FontsourceFamilySummary[],
  query: string,
  limit = MAX_PICKER_FAMILIES
): FontsourceFamilySummary[] => {
  const words = query.trim().toLowerCase()
  if (words === '') return families.slice(0, limit)
  const starting = families.filter((entry) => entry.family.toLowerCase().startsWith(words))
  const containing = families.filter(
    (entry) =>
      !entry.family.toLowerCase().startsWith(words) && entry.family.toLowerCase().includes(words)
  )
  return [...starting, ...containing].slice(0, limit)
}

/**
 * Writes the `fontFamily` list a picked family sets: its name, quoted when CSS needs it, and a
 * generic family for its category.
 * @param family - The family picked.
 * @returns A list such as `"Playfair Display", serif`.
 */
export const toFontFamilyValue = (family: FontsourceFamilySummary): string => {
  const name = NEEDS_QUOTES.test(family.family) ? `"${family.family}"` : family.family
  const generic = GENERIC_BY_CATEGORY[family.category]
  return generic === undefined ? name : `${name}, ${generic}`
}

/**
 * Reads the family a `fontFamily` list draws with, which is what the picker shows.
 * @param fontFamily - A node's `fontFamily`.
 * @returns The first family named; an empty string for an empty list.
 */
export const readPickedFamilyName = (fontFamily: string): string =>
  parseFontFamilyList(fontFamily)[0] ?? ''
