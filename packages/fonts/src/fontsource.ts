import type { FontVariant } from '@designo/core'
import { fontsourceFamilySchema } from '@designo/storage/schemas'
import type { FontsourceFamily } from '@designo/storage'
import type {
  FontFamilyFiles,
  FontFile,
  FontsourceResolverOptions,
  ResolveFontFamily
} from './types.ts'

/** The Fontsource API's families endpoint. Its files are served by jsDelivr. */
export const FONTSOURCE_API_URL = 'https://api.fontsource.org/v1/fonts/'

const HTTP_NOT_FOUND = 404
const LATIN_SUBSET = 'latin'
const RANGE_SEPARATOR = ','

/**
 * Turns a family name into the id the Fontsource API files it under.
 * @param family - A family name such as `Noto Sans Arabic`.
 * @returns The id, such as `noto-sans-arabic`; empty for a name with no letters or digits.
 */
export const toFontsourceId = (family: string): string =>
  family
    .trim()
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-|-$/g, '')

const pickWeight = (weights: readonly string[], wanted: number): string | undefined =>
  weights.toSorted(
    (left, right) => Math.abs(Number(left) - wanted) - Math.abs(Number(right) - wanted)
  )[0]

// Numbered subsets, which split a big script such as Japanese, are `0` in the files and `[0]` in
// the ranges.
const findRange = (data: FontsourceFamily, subset: string): string | undefined =>
  data.unicodeRange[subset] ?? data.unicodeRange[`[${subset}]`]

const latinFirst = (subsets: readonly string[]): string[] =>
  subsets.toSorted((left, right) => Number(right === LATIN_SUBSET) - Number(left === LATIN_SUBSET))

const toFontFile = (
  data: FontsourceFamily,
  variant: FontVariant,
  subset: string,
  url: string | undefined
): FontFile[] => {
  const range = findRange(data, subset)
  return url === undefined || range === undefined
    ? []
    : [
        {
          // The weight and style are in the id, because one family's files differ by them.
          id: `${data.id}:${variant.fontWeight}${variant.fontStyle}:${subset}`,
          family: data.family,
          ...variant,
          subset,
          url,
          coverage: range.split(RANGE_SEPARATOR).map((part) => part.trim())
        }
      ]
}

/**
 * Lists a family's files for one weight and style.
 * @param data - The family as the API describes it.
 * @param variant - The weight wanted, of which the nearest is used, and the style, of which the
 *   family's first is used when it lacks the one asked for.
 * @returns The family with one file per subset, the Latin one first.
 */
export const toFontFamilyFiles = (
  data: FontsourceFamily,
  variant: FontVariant
): FontFamilyFiles => {
  const weightKey = pickWeight(Object.keys(data.variants), variant.fontWeight)
  const styles = weightKey === undefined ? {} : (data.variants[weightKey] ?? {})
  const styleKey = variant.fontStyle in styles ? variant.fontStyle : Object.keys(styles)[0]
  const subsetFiles = styleKey === undefined ? {} : (styles[styleKey] ?? {})
  // The file's own weight and style, which can differ from the ones asked for.
  const found: FontVariant = {
    fontWeight: Number(weightKey ?? variant.fontWeight),
    fontStyle: styleKey === 'italic' ? 'italic' : 'normal'
  }
  const files = latinFirst(Object.keys(subsetFiles)).flatMap((subset) =>
    toFontFile(data, found, subset, subsetFiles[subset]?.url.ttf)
  )
  return { id: data.id, family: data.family, files }
}

/**
 * Builds the lookup that finds a family's font files through the Fontsource API, which has every
 * Google font and more. Files are TrueType, which HarfBuzz and the screenshot renderer both read.
 * @param options - How to fetch.
 * @returns A lookup that answers undefined for a family the API does not have.
 */
export const createFontsourceResolver = ({
  fetch,
  apiUrl = FONTSOURCE_API_URL
}: FontsourceResolverOptions): ResolveFontFamily => {
  return async (family, variant) => {
    const id = toFontsourceId(family)
    if (id === '') return undefined
    const response = await fetch(`${apiUrl}${encodeURIComponent(id)}`)
    if (response.status === HTTP_NOT_FOUND) return undefined
    if (!response.ok) throw new Error(`The font API answered ${response.status} for ${family}`)
    const data = fontsourceFamilySchema.parse(await response.json())
    return toFontFamilyFiles(data, variant)
  }
}
