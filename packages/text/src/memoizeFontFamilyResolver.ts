import { toFontsourceId, type FontFamilyFiles, type ResolveFontFamily } from '@designo/fonts'

/**
 * Remembers each family's answer, found or not, so a family is asked for once. A failed request is
 * forgotten, so a dropped connection is retried rather than remembered as a missing family.
 * @param resolve - The lookup to remember the answers of.
 * @returns The same lookup, asking the network once per family.
 */
export const memoizeFontFamilyResolver = (resolve: ResolveFontFamily): ResolveFontFamily => {
  const answers = new Map<string, Promise<FontFamilyFiles | undefined>>()
  return (family, variant) => {
    // The Fontsource answer describes every weight, but the files chosen from it do not.
    const key = `${toFontsourceId(family)}:${variant.fontWeight}${variant.fontStyle}`
    const known = answers.get(key)
    if (known) return known
    const answer = resolve(family, variant)
    answers.set(key, answer)
    answer.catch(() => answers.delete(key))
    return answer
  }
}
