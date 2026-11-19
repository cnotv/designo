import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { FontFamilyFiles } from '@designo/fonts'
import { createFontLibrary } from '../fontLibrary.ts'
import { compileFontCatalog, createFontRegistry, createFontStore } from '../fontRegistry.ts'
import { createHarfBuzzShapingFont } from '../harfBuzzFont.ts'
import type {
  FontBytesLoader,
  FontCatalog,
  FontLibrary,
  FontRegistry,
  FontStore
} from '../types.ts'
import { FIXTURE_FONT_CATALOG_DATA } from './fixtureFontCatalog.ts'

const FIXTURES_DIRECTORY = new URL('./', import.meta.url)

/** A Noto Sans subset that has the `fi` ligature, which Inter does not. */
export const LIGATURE_FIXTURE_FILE = 'NotoSans-Latin.fixture.ttf'

/** The test fonts with their ranges as numbers. */
export const FIXTURE_FONT_CATALOG = compileFontCatalog(FIXTURE_FONT_CATALOG_DATA)

/**
 * Reads a test font kept beside the tests, standing in for the font API's files.
 * @param fileName - The file in the `fixtures` folder, as a catalog entry's URL names it.
 * @returns The file's bytes.
 */
export const readFixtureFontBytes: FontBytesLoader = async (fileName) =>
  new Uint8Array(await readFile(fileURLToPath(new URL(fileName, FIXTURES_DIRECTORY))))

/**
 * A store that reads the test fonts from disk.
 * @param loadBytes - How to read a file; the fixtures by default, a spy to count reads.
 * @returns The store.
 */
export const createFixtureFontStore = (
  loadBytes: FontBytesLoader = readFixtureFontBytes
): FontStore => createFontStore({ loadBytes, createShapingFont: createHarfBuzzShapingFont })

/**
 * A registry over the test fonts.
 * @param catalog - The fonts; the fixture catalog by default.
 * @param store - Where the files load; one reading the fixtures by default.
 * @returns The registry.
 */
export const createFixtureFontRegistry = (
  catalog: FontCatalog = FIXTURE_FONT_CATALOG,
  store: FontStore = createFixtureFontStore()
): FontRegistry => createFontRegistry({ catalog, store })

/** The test fonts as families the font API would answer with, by lowercase family name. */
const FIXTURE_FAMILIES = new Map<string, FontFamilyFiles>(
  FIXTURE_FONT_CATALOG_DATA.fonts.map((font) => [
    font.family.toLowerCase(),
    {
      id: font.id,
      family: font.family,
      files: [{ ...font, fontWeight: 400, fontStyle: 'normal', subset: 'fixture' }]
    }
  ])
)

/**
 * A library whose font API knows only the test fonts' families.
 * @param store - Where the files load; one reading the fixtures by default.
 * @returns The library.
 */
export const createFixtureFontLibrary = (
  store: FontStore = createFixtureFontStore()
): FontLibrary =>
  createFontLibrary({
    resolveFamily: (family) => Promise.resolve(FIXTURE_FAMILIES.get(family.trim().toLowerCase())),
    store
  })
