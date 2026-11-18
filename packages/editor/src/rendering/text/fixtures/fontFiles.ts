import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { FontBytesLoader } from '../types.ts'

const PUBLIC_FONTS_DIRECTORY = new URL('../../../../public/', import.meta.url)
const FIXTURES_DIRECTORY = new URL('./', import.meta.url)

/** A Noto Sans subset that has the `fi` ligature, which Inter does not. */
export const LIGATURE_FIXTURE_FILE = 'NotoSans-Latin.fixture.ttf'

/**
 * Reads a bundled font from `public/`, the way the browser would fetch it, so tests shape with the
 * real files.
 * @param url - The font's catalog URL, such as `fonts/Inter-Regular.subset.ttf`.
 * @returns The file's bytes.
 */
export const readBundledFontBytes: FontBytesLoader = async (url) =>
  new Uint8Array(await readFile(fileURLToPath(new URL(url, PUBLIC_FONTS_DIRECTORY))))

/**
 * Reads a test-only font kept beside the tests.
 * @param fileName - The file in the `fixtures` folder.
 * @returns The file's bytes.
 */
export const readFixtureFontBytes = async (fileName: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(fileURLToPath(new URL(fileName, FIXTURES_DIRECTORY))))
