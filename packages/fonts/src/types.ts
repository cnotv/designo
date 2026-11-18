/** One font file: a family's characters in one subset, such as Latin or Cyrillic. */
export interface FontFile {
  /** Unique across families, such as `gelasio:latin`. */
  id: string
  /** The family name inside the file, which a renderer matches by. */
  family: string
  subset: string
  /** Where the TrueType file is fetched from. */
  url: string
  /** The code points the file draws, as `U+0600-06FF` ranges or a single `U+00A0`. */
  coverage: readonly string[]
}

/** A family's files for one weight and style, the Latin file first. */
export interface FontFamilyFiles {
  /** The font API's id for the family, such as `noto-sans-arabic`. */
  id: string
  family: string
  files: readonly FontFile[]
}

/** Looks a family up by name; undefined when the font API has no such family. */
export type ResolveFontFamily = (family: string) => Promise<FontFamilyFiles | undefined>

/** The part of `fetch` the font API client uses, so tests can answer for the network. */
export type FontFetch = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export interface FontsourceResolverOptions {
  fetch: FontFetch
  /** The API's families endpoint, ending in a slash. */
  apiUrl?: string
  /** The weight wanted; the nearest one the family has is used. */
  weight?: number
  /** The style wanted; the family's first style is used when it lacks it. */
  style?: string
}

/** An inclusive range of Unicode code points. */
export type CodePointRange = readonly [first: number, last: number]

/** A font's vertical metrics, in font units; the descender is negative, below the baseline. */
export interface FontLineMetrics {
  unitsPerEm: number
  ascender: number
  descender: number
}
