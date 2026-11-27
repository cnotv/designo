import type { FontVariant } from '@designo/core'
import { toFontsourceId } from './fontsource.ts'
import type { FontFamilyFiles, FontFile, ResolveFontFamily, UploadedFont } from './types.ts'

// An uploaded file is not cut into subsets, so it claims every character until it loads; then its
// own character map decides, as it does for a subset whose range names a missing glyph.
const EVERY_CODE_POINT = 'U+0000-10FFFF'
const UPLOADED_SUBSET = 'uploaded'
// A style mismatch weighs more than any weight difference, as a browser matches fonts.
const STYLE_MISMATCH_PENALTY = 10_000

const distanceFrom = (font: UploadedFont, variant: FontVariant): number =>
  Number(font.fontStyle !== variant.fontStyle) * STYLE_MISMATCH_PENALTY +
  Math.abs(font.fontWeight - variant.fontWeight)

const toFontFile = (font: UploadedFont): FontFile => ({
  id: `uploaded:${font.id}`,
  family: font.family,
  fontWeight: font.fontWeight,
  fontStyle: font.fontStyle,
  subset: UPLOADED_SUBSET,
  url: font.url,
  coverage: [EVERY_CODE_POINT]
})

/**
 * Finds a family among an account's uploaded fonts, by name as the font menu lists it, and picks
 * the file nearest the weight and style asked for.
 * @param fonts - The account's fonts.
 * @param family - A family name from a `fontFamily` list.
 * @param variant - The weight and style wanted.
 * @returns The family with its one chosen file; undefined when none of the fonts has that name.
 */
export const findUploadedFamily = (
  fonts: readonly UploadedFont[],
  family: string,
  variant: FontVariant
): FontFamilyFiles | undefined => {
  const id = toFontsourceId(family)
  const [nearest] = fonts
    .filter((font) => toFontsourceId(font.family) === id)
    .toSorted((left, right) => distanceFrom(left, variant) - distanceFrom(right, variant))
  return nearest
    ? { id: `uploaded:${id}`, family: nearest.family, files: [toFontFile(nearest)] }
    : undefined
}

/**
 * Puts an account's uploaded fonts in front of another lookup: a family the account uploaded is
 * drawn with its file, even when the font API has one of the same name.
 * @param listFonts - The account's fonts, read when a family is looked up, so an upload counts
 *   from the next lookup on.
 * @param fallback - The lookup for everything else, usually the Fontsource API.
 * @returns The combined lookup.
 */
export const withUploadedFonts =
  (
    listFonts: () => Promise<readonly UploadedFont[]>,
    fallback: ResolveFontFamily
  ): ResolveFontFamily =>
  async (family, variant) =>
    findUploadedFamily(await listFonts(), family, variant) ?? fallback(family, variant)
