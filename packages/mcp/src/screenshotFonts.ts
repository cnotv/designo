import { mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FontLineMetrics } from '@designo/exporter'
import {
  createFontsourceResolver,
  isInCodePointRanges,
  parseCodePointRange,
  readCharacterMap,
  readLineMetrics,
  renameFontFamily,
  resolveFontFamilies,
  type FontFile
} from '@designo/fonts'
import {
  cacheKey,
  createCachingFetch,
  fetchFontBytes,
  fetchWithTimeout,
  writeAtomically
} from './fontNetwork.ts'
import type {
  LoadScreenshotFonts,
  ScreenshotFontLoaderOptions,
  ScreenshotFonts,
  ScreenshotText
} from './types.ts'

/** Where downloaded fonts and the font API's answers are kept between screenshots. */
export const DEFAULT_FONT_CACHE_DIRECTORY = join(tmpdir(), 'designo-fonts')

const LOCAL_FAMILY_KEY_LENGTH = 16
// Line breaks and tabs are layout, not glyphs, so they never need a font.
const IGNORED_CHARACTER_PATTERN = /^[\t\n\r]$/

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const codePointOf = (character: string): number => character.codePointAt(0) ?? 0

/** A font file on disk, renamed so the renderer can be told to use exactly this file. */
interface LocalFontFile {
  path: string
  family: string
  has: (codePoint: number) => boolean
  metrics: FontLineMetrics
}

type LoadLocalFile = (file: FontFile) => Promise<LocalFontFile | undefined>

// Every subset file of a family carries the family's name, and resvg picks one file per name, so
// each file gets a name of its own: a run then names the one file that has its glyphs.
const createLocalFileLoader =
  (
    directory: string,
    fetchBytes: (url: string) => Promise<Uint8Array>,
    warn: (message: string) => void
  ): LoadLocalFile =>
  async (file) => {
    const key = cacheKey(file.url)
    const path = join(directory, `${key}.ttf`)
    const family = `designo-${key.slice(0, LOCAL_FAMILY_KEY_LENGTH)}`
    try {
      const cached = await readFile(path).catch(() => undefined)
      const bytes = cached
        ? new Uint8Array(cached)
        : renameFontFamily(await fetchBytes(file.url), family)
      if (!cached) await writeAtomically(path, bytes)
      return { path, family, has: readCharacterMap(bytes), metrics: readLineMetrics(bytes) }
    } catch (error) {
      warn(`Designo: font ${file.url} did not load: ${describeError(error)}`)
      return undefined
    }
  }

interface Assignment {
  locals: LocalFontFile[]
  owners: [string, LocalFontFile][]
}

// Goes through the files in order of preference. A file whose ranges name a character still
// without a font is loaded, and takes the characters it really has a glyph for: ranges say what a
// subset was cut to cover, and a file can lack a character its range names.
const assignCharacters = async (
  files: readonly FontFile[],
  pending: readonly string[],
  load: LoadLocalFile
): Promise<Assignment> => {
  const [file, ...rest] = files
  if (!file || pending.length === 0) return { locals: [], owners: [] }
  const ranges = file.coverage.map(parseCodePointRange)
  const claimed = pending.filter((character) => isInCodePointRanges(ranges, codePointOf(character)))
  const local = claimed.length === 0 ? undefined : await load(file)
  const taken = local ? claimed.filter((character) => local.has(codePointOf(character))) : []
  const next = await assignCharacters(
    rest,
    pending.filter((character) => !taken.includes(character)),
    load
  )
  if (!local) return next
  return {
    locals: [local, ...next.locals],
    owners: [
      ...taken.map((character): [string, LocalFontFile] => [character, local]),
      ...next.owners
    ]
  }
}

interface ListFonts {
  /** The metrics of the list's first family, which place the baseline as the editor does. */
  metrics: FontLineMetrics | undefined
  /** The file the text is drawn with. */
  drawing: LocalFontFile | undefined
  locals: readonly LocalFontFile[]
}

const groupTextByFamilyList = (texts: readonly ScreenshotText[]): Map<string, string> =>
  texts.reduce(
    (groups, { fontFamily, text }) =>
      new Map([...groups, [fontFamily, `${groups.get(fontFamily) ?? ''}${text}`]]),
    new Map<string, string>()
  )

// resvg draws a text with one font and falls back, character by character, to the other fonts it
// has. Drawing with the file that has most of the characters leaves the fewest to fall back for.
const chooseDrawingFile = (assignment: Assignment): LocalFontFile | undefined =>
  assignment.locals.reduce<{ local: LocalFontFile; count: number } | undefined>((best, local) => {
    const count = assignment.owners.filter(([, owner]) => owner === local).length
    return best && best.count >= count ? best : { local, count }
  }, undefined)?.local

/**
 * Builds the loader `get_screenshot` uses to find fonts. For each family list on the page it asks
 * the font API for the families, then downloads, once, the subset files its characters need,
 * checking each file has the glyphs. The text is drawn with the file that has most of them, and
 * the renderer falls back to the others for the rest. Nothing ships with Designo; a family the API
 * cannot reach is left out, and its text is drawn with the page's other fonts.
 * @param options - How to fetch, and the cache folder.
 * @returns The loader.
 */
export const createScreenshotFontLoader = ({
  fetchJson = fetchWithTimeout,
  fetchBytes = fetchFontBytes,
  cacheDirectory = DEFAULT_FONT_CACHE_DIRECTORY,
  warn = (message) => console.error(message)
}: ScreenshotFontLoaderOptions = {}): LoadScreenshotFonts => {
  const resolveFamily = createFontsourceResolver({
    fetch: createCachingFetch(fetchJson, cacheDirectory)
  })
  const loadLocal = createLocalFileLoader(cacheDirectory, fetchBytes, warn)

  const findListFonts = async ([fontFamily, text]: [string, string]): Promise<
    [string, ListFonts]
  > => {
    const families = await resolveFontFamilies(fontFamily, resolveFamily).catch(
      (error: unknown) => {
        warn(`Designo: no fonts for ${fontFamily}: ${describeError(error)}`)
        return []
      }
    )
    const primaryFile = families[0]?.files[0]
    const primary = primaryFile ? await loadLocal(primaryFile) : undefined
    const characters = [...new Set(text)].filter(
      (character) => !IGNORED_CHARACTER_PATTERN.test(character)
    )
    const assignment = await assignCharacters(
      families.flatMap((family) => family.files),
      characters,
      loadLocal
    )
    const locals = primary ? [primary, ...assignment.locals] : assignment.locals
    return [
      fontFamily,
      { metrics: primary?.metrics, drawing: chooseDrawingFile(assignment) ?? primary, locals }
    ]
  }

  return async (texts): Promise<ScreenshotFonts> => {
    await mkdir(cacheDirectory, { recursive: true })
    const lists = new Map(await Promise.all([...groupTextByFamilyList(texts)].map(findListFonts)))
    const found = [...lists.values()]
    // A list whose families could not be found borrows the page's first font, so its text still shows.
    const standIn = found.find((fonts) => fonts.drawing)
    const fontsFor = (fontFamily: string): ListFonts | undefined => {
      const fonts = lists.get(fontFamily)
      return fonts?.drawing ? fonts : standIn
    }
    return {
      files: [...new Set(found.flatMap((fonts) => fonts.locals.map((local) => local.path)))],
      resolveFontFamily: (fontFamily) => fontsFor(fontFamily)?.drawing?.family,
      getFontMetrics: (fontFamily) => fontsFor(fontFamily)?.metrics
    }
  }
}

/** The loader `get_screenshot` uses unless a host replaces it. */
export const loadScreenshotFonts: LoadScreenshotFonts = createScreenshotFontLoader()
