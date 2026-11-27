import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fontIdSchema } from './schemas.ts'

/** The largest font file the store keeps, in bytes. */
export const MAX_FONT_BYTES = 10_485_760
const MAX_FONT_MEGABYTES = 10

const FONT_DIRECTORY = 'fonts'
const SIGNATURE_LENGTH = 4
const HEX_RADIX = 16

// TrueType outlines (version 1.0 or Apple's `true`) are `ttf`, CFF outlines (`OTTO`) are `otf`.
const FONT_EXTENSIONS: Readonly<Record<string, 'ttf' | 'otf'>> = {
  '00010000': 'ttf',
  '74727565': 'ttf',
  '4f54544f': 'otf'
}

/**
 * Tells a font file's kind from its first bytes, never from a name or a claimed type.
 * @param bytes - The file's contents.
 * @returns `ttf` or `otf`; undefined for WOFF, a collection, or anything that is not a font.
 */
export const detectFontExtension = (bytes: Uint8Array): 'ttf' | 'otf' | undefined =>
  FONT_EXTENSIONS[
    Array.from(bytes.subarray(0, SIGNATURE_LENGTH), (byte) =>
      byte.toString(HEX_RADIX).padStart(2, '0')
    ).join('')
  ]

// The id becomes a file name, so it is validated before it can reach the file system.
const fontPath = (dataDirectory: string, fontId: string): string =>
  path.join(dataDirectory, FONT_DIRECTORY, fontIdSchema.parse(fontId))

/**
 * Keeps a font file in the data directory under the SHA-256 of its bytes, so a font uploaded twice
 * is stored once. The data directory is the account's own, so no other account sees it.
 * @param dataDirectory - Where the account's Designo files live.
 * @param bytes - The font file's contents.
 * @returns The font id.
 */
export const writeFontFile = async (dataDirectory: string, bytes: Uint8Array): Promise<string> => {
  if (bytes.byteLength > MAX_FONT_BYTES) {
    throw new Error(`The font is larger than ${MAX_FONT_MEGABYTES} MB`)
  }
  const extension = detectFontExtension(bytes)
  if (!extension) throw new Error('The file is not a TrueType or OpenType font')
  const fontId = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  const targetPath = fontPath(dataDirectory, fontId)
  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, targetPath)
  return fontId
}

/**
 * Lists the fonts stored in a data directory.
 * @param dataDirectory - Where the account's Designo files live.
 * @returns The font ids, sorted; none when nothing was uploaded.
 */
export const listFontFiles = async (dataDirectory: string): Promise<string[]> => {
  const names = await readdir(path.join(dataDirectory, FONT_DIRECTORY)).catch(() => [])
  return names.filter((name) => fontIdSchema.safeParse(name).success).toSorted()
}

/**
 * Reads a stored font file.
 * @param dataDirectory - Where the account's Designo files live.
 * @param fontId - The id `writeFontFile` returned.
 * @returns The bytes.
 */
export const readFontFile = async (dataDirectory: string, fontId: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(fontPath(dataDirectory, fontId)))

/**
 * Finds where a stored font file is on disk, for a reader that takes a path.
 * @param dataDirectory - Where the account's Designo files live.
 * @param fontId - A font id.
 * @returns The absolute path; throws for an id that is not a font id.
 */
export const getFontFilePath = (dataDirectory: string, fontId: string): string =>
  path.resolve(fontPath(dataDirectory, fontId))
