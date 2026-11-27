import type { FontDescription } from './types.ts'

const DIRECTORY = { numTables: 4, headerBytes: 12, recordBytes: 16, offset: 8 }
const NAME = { count: 2, stringOffset: 4, headerBytes: 6, recordBytes: 12 }
const NAME_RECORD = { platform: 0, encoding: 2, nameId: 6, length: 8, offset: 10 }
const NAME_IDS = { family: 1, typographicFamily: 16 }
const OS2 = { weightClass: 4, fsSelection: 62, italic: 0b1 }
const HEAD = { macStyle: 44, italic: 0b10 }
const PLATFORMS = { unicode: 0, macintosh: 1, windows: 3 }
const MAC_ROMAN = 0
const WINDOWS_UNICODE_ENCODINGS = new Set([0, 1, 10])
const TAG_LENGTH = 4
const DEFAULT_WEIGHT = 400
const MAX_WEIGHT = 1000

const toView = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const readTag = (view: DataView, offset: number): string =>
  String.fromCodePoint(
    ...Array.from({ length: TAG_LENGTH }, (_, index) => view.getUint8(offset + index))
  )

const findTableOffset = (view: DataView, tag: string): number | undefined =>
  Array.from({ length: view.getUint16(DIRECTORY.numTables) }, (_, index) => {
    const at = DIRECTORY.headerBytes + index * DIRECTORY.recordBytes
    return { tag: readTag(view, at), offset: view.getUint32(at + DIRECTORY.offset) }
  }).find((record) => record.tag === tag)?.offset

interface NameRecord {
  platform: number
  encoding: number
  nameId: number
  text: string
}

const decodeName = (bytes: Uint8Array, platform: number, encoding: number): string | undefined => {
  if (platform === PLATFORMS.macintosh) {
    return encoding === MAC_ROMAN ? new TextDecoder('latin1').decode(bytes) : undefined
  }
  if (platform === PLATFORMS.unicode) return new TextDecoder('utf-16be').decode(bytes)
  if (platform === PLATFORMS.windows && WINDOWS_UNICODE_ENCODINGS.has(encoding)) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  return undefined
}

const readNameRecords = (bytes: Uint8Array, view: DataView, table: number): NameRecord[] => {
  const strings = table + view.getUint16(table + NAME.stringOffset)
  return Array.from({ length: view.getUint16(table + NAME.count) }, (_, index) => {
    const at = table + NAME.headerBytes + index * NAME.recordBytes
    const platform = view.getUint16(at + NAME_RECORD.platform)
    const encoding = view.getUint16(at + NAME_RECORD.encoding)
    const start = strings + view.getUint16(at + NAME_RECORD.offset)
    const text = decodeName(
      bytes.subarray(start, start + view.getUint16(at + NAME_RECORD.length)),
      platform,
      encoding
    )
    return text === undefined
      ? []
      : [{ platform, encoding, nameId: view.getUint16(at + NAME_RECORD.nameId), text: text.trim() }]
  }).flat()
}

// The typographic family groups every weight under one name; the legacy family splits off
// weights beyond regular and bold, so it is the fallback. Windows names come first, as renderers
// read those.
const pickFamilyName = (records: readonly NameRecord[]): string | undefined =>
  [NAME_IDS.typographicFamily, NAME_IDS.family]
    .flatMap((nameId) =>
      records
        .filter((record) => record.nameId === nameId && record.text !== '')
        .toSorted(
          (left, right) =>
            Number(right.platform === PLATFORMS.windows) -
            Number(left.platform === PLATFORMS.windows)
        )
    )
    .at(0)?.text

const readWeight = (view: DataView, os2: number | undefined): number => {
  const weight = os2 === undefined ? DEFAULT_WEIGHT : view.getUint16(os2 + OS2.weightClass)
  return weight >= 1 && weight <= MAX_WEIGHT ? weight : DEFAULT_WEIGHT
}

const readIsItalic = (view: DataView, os2: number | undefined, head: number | undefined) =>
  os2 === undefined
    ? head !== undefined && (view.getUint16(head + HEAD.macStyle) & HEAD.italic) !== 0
    : (view.getUint16(os2 + OS2.fsSelection) & OS2.italic) !== 0

/**
 * Reads the family, weight and style a font file declares, the way a font menu would list it.
 * @param bytes - A TrueType or OpenType file; `detectFontExtension` in the store tells one apart.
 * @returns What the file says about itself; throws for a file that is not a font or names no
 *   family, so a broken upload is refused before it is stored.
 */
export const readFontDescription = (bytes: Uint8Array): FontDescription => {
  try {
    const view = toView(bytes)
    const nameTable = findTableOffset(view, 'name')
    const family =
      nameTable === undefined ? undefined : pickFamilyName(readNameRecords(bytes, view, nameTable))
    if (!family) throw new Error('The font names no family')
    const os2 = findTableOffset(view, 'OS/2')
    return {
      family,
      fontWeight: readWeight(view, os2),
      fontStyle: readIsItalic(view, os2, findTableOffset(view, 'head')) ? 'italic' : 'normal'
    }
  } catch (error) {
    // A table that points past the end of the file throws a RangeError from the view.
    throw new Error(
      error instanceof Error && !(error instanceof RangeError)
        ? error.message
        : 'The font file is damaged'
    )
  }
}
