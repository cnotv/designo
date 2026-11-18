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
const DEFAULT_WEIGHT = 400
const DEFAULT_STYLE = 'normal'
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
  subset: string,
  url: string | undefined
): FontFile[] => {
  const range = findRange(data, subset)
  return url === undefined || range === undefined
    ? []
    : [
        {
          id: `${data.id}:${subset}`,
          family: data.family,
          subset,
          url,
          coverage: range.split(RANGE_SEPARATOR).map((part) => part.trim())
        }
      ]
}

/**
 * Lists a family's files for one weight and style.
 * @param data - The family as the API describes it.
 * @param weight - The weight wanted; the nearest one is used.
 * @param style - The style wanted; the first one is used when the family lacks it.
 * @returns The family with one file per subset, the Latin one first.
 */
export const toFontFamilyFiles = (
  data: FontsourceFamily,
  weight: number,
  style: string
): FontFamilyFiles => {
  const weightKey = pickWeight(Object.keys(data.variants), weight)
  const styles = weightKey === undefined ? {} : (data.variants[weightKey] ?? {})
  const subsetFiles = styles[style] ?? Object.values(styles)[0] ?? {}
  const files = latinFirst(Object.keys(subsetFiles)).flatMap((subset) =>
    toFontFile(data, subset, subsetFiles[subset]?.url.ttf)
  )
  return { id: data.id, family: data.family, files }
}

/**
 * Builds the lookup that finds a family's font files through the Fontsource API, which has every
 * Google font and more. Files are TrueType, which HarfBuzz and the screenshot renderer both read.
 * @param options - How to fetch, and the weight and style wanted.
 * @returns A lookup that answers undefined for a family the API does not have.
 */
export const createFontsourceResolver = ({
  fetch,
  apiUrl = FONTSOURCE_API_URL,
  weight = DEFAULT_WEIGHT,
  style = DEFAULT_STYLE
}: FontsourceResolverOptions): ResolveFontFamily => {
  return async (family) => {
    const id = toFontsourceId(family)
    if (id === '') return undefined
    const response = await fetch(`${apiUrl}${encodeURIComponent(id)}`)
    if (response.status === HTTP_NOT_FOUND) return undefined
    if (!response.ok) throw new Error(`The font API answered ${response.status} for ${family}`)
    const data = fontsourceFamilySchema.parse(await response.json())
    return toFontFamilyFiles(data, weight, style)
  }
}
