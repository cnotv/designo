import { pathToFileURL } from 'node:url'
import { readFontDescription, type FontDescription, type UploadedFont } from '@designo/fonts'
import {
  detectFontExtension,
  getFontFilePath,
  listFontFiles,
  readFontFile,
  writeFontFile,
  type UploadedFontSummary
} from '@designo/storage'
import { layoutTextWithFontsourceFonts, createNodeLayoutText } from './textLayout.ts'
import { createScreenshotFontLoader, loadScreenshotFonts } from './screenshotFonts.ts'
import type { AccountFonts } from './types.ts'

// A font id is the hash of its bytes, so what a file declares never changes and is read once.
const knownDescriptions: { value: ReadonlyMap<string, FontDescription | undefined> } = {
  value: new Map()
}

const rememberDescription = (fontId: string, description: FontDescription | undefined): void => {
  knownDescriptions.value = new Map([...knownDescriptions.value, [fontId, description]])
}

const describeStoredFont = async (
  dataDirectory: string,
  fontId: string
): Promise<FontDescription | undefined> => {
  if (knownDescriptions.value.has(fontId)) return knownDescriptions.value.get(fontId)
  const description = await readFontFile(dataDirectory, fontId)
    .then(readFontDescription)
    .catch(() => undefined)
  rememberDescription(fontId, description)
  return description
}

/**
 * Lists the fonts an account uploaded, with the family, weight and style each file declares.
 * @param dataDirectory - The account's folder.
 * @returns The fonts, sorted by family then weight; a file that no longer reads is left out.
 */
export const listUploadedFonts = async (dataDirectory: string): Promise<UploadedFontSummary[]> => {
  const ids = await listFontFiles(dataDirectory)
  const described = await Promise.all(
    ids.map(async (id) => {
      const description = await describeStoredFont(dataDirectory, id)
      return description ? [{ id, ...description }] : []
    })
  )
  return described
    .flat()
    .toSorted(
      (left, right) => left.family.localeCompare(right.family) || left.fontWeight - right.fontWeight
    )
}

/**
 * Stores a font an account uploads, after checking it is a font that names its family.
 * @param dataDirectory - The account's folder.
 * @param bytes - The TrueType or OpenType file.
 * @returns The stored font as the list shows it; rejects with a sentence for a file it refuses.
 */
export const storeUploadedFont = async (
  dataDirectory: string,
  bytes: Uint8Array
): Promise<UploadedFontSummary> => {
  if (!detectFontExtension(bytes)) throw new Error('The file is not a TrueType or OpenType font')
  const description = readFontDescription(bytes)
  const id = await writeFontFile(dataDirectory, bytes)
  rememberDescription(id, description)
  return { id, ...description }
}

/**
 * Gives each uploaded font the `file:` address of its stored file, which the Node layout and the
 * screenshot renderer read it from.
 * @param dataDirectory - The account's folder.
 * @param fonts - The account's fonts, as listed.
 * @returns The fonts with their addresses.
 */
export const toFileUrlFonts = (
  dataDirectory: string,
  fonts: readonly UploadedFontSummary[]
): UploadedFont[] =>
  fonts.map((font) => ({
    ...font,
    url: pathToFileURL(getFontFilePath(dataDirectory, font.id)).href
  }))

// One entry per account folder: the fonts it was made for, and the layout and loader made.
const accountFontCache: { value: ReadonlyMap<string, { key: string; fonts: AccountFonts }> } = {
  value: new Map()
}

const SHARED_FONTS: AccountFonts = {
  layoutText: layoutTextWithFontsourceFonts,
  loadScreenshotFonts
}

/**
 * The layout and the screenshot fonts for an account: the shared ones when it uploaded nothing,
 * otherwise ones that find its fonts first. They are made again when its fonts change, since a
 * layout remembers the families it has looked up.
 * @param dataDirectory - The account's folder.
 * @returns The text layout and the screenshot font loader.
 */
export const getAccountFonts = async (dataDirectory: string): Promise<AccountFonts> => {
  const uploaded = await listUploadedFonts(dataDirectory)
  if (uploaded.length === 0) return SHARED_FONTS
  const key = uploaded.map((font) => font.id).join(',')
  const cached = accountFontCache.value.get(dataDirectory)
  if (cached?.key === key) return cached.fonts
  const uploadedFonts = toFileUrlFonts(dataDirectory, uploaded)
  const fonts: AccountFonts = {
    layoutText: createNodeLayoutText({ uploadedFonts }),
    loadScreenshotFonts: createScreenshotFontLoader({ uploadedFonts })
  }
  accountFontCache.value = new Map([...accountFontCache.value, [dataDirectory, { key, fonts }]])
  return fonts
}
