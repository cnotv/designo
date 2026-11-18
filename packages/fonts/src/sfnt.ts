import type { FontLineMetrics } from './types.ts'

// Byte offsets from the OpenType specification. A file starts with a table directory: a 12-byte
// header holding the table count, then one 16-byte record per table.
const DIRECTORY = { headerBytes: 12, numTables: 4, recordBytes: 16, tableAlignment: 4 }
const RECORD = { checksum: 4, offset: 8, length: 12 }
const CMAP = { numSubtables: 2, recordsStart: 4, recordBytes: 8, subtableOffset: 4 }
const FORMAT_4 = { segCountTimesTwo: 6, endCodes: 14, reservedPadBytes: 2 }
const FORMAT_12 = { numGroups: 12, groupsStart: 16, groupBytes: 12, endChar: 4, startGlyph: 8 }
const HEAD = { unitsPerEm: 18 }
const HHEA = { ascender: 4, descender: 6 }
const OS2 = { fsSelection: 62, typoAscender: 68, typoDescender: 70, useTypoMetrics: 0b1000_0000 }
const UNICODE_PLATFORMS = new Set([0, 3])
const CMAP_FORMATS = { segmented: 4, grouped: 12 }
const BYTES_PER_UINT16 = 2
const BYTE_BITS = 8
const BYTE_MASK = 0xff
const UINT16_MASK = 0xff_ff
const NO_GLYPH = 0
const TAG_LENGTH = 4

interface TableRecord {
  tag: string
  checksum: number
  offset: number
  length: number
}

type GlyphLookup = (codePoint: number) => number

const toView = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const readTag = (view: DataView, offset: number): string =>
  String.fromCodePoint(
    ...Array.from({ length: TAG_LENGTH }, (_, index) => view.getUint8(offset + index))
  )

const readTables = (view: DataView): TableRecord[] =>
  Array.from({ length: view.getUint16(DIRECTORY.numTables) }, (_, index) => {
    const at = DIRECTORY.headerBytes + index * DIRECTORY.recordBytes
    return {
      tag: readTag(view, at),
      checksum: view.getUint32(at + RECORD.checksum),
      offset: view.getUint32(at + RECORD.offset),
      length: view.getUint32(at + RECORD.length)
    }
  })

const findTable = (view: DataView, tag: string): TableRecord | undefined =>
  readTables(view).find((record) => record.tag === tag)

const requireTable = (view: DataView, tag: string): TableRecord => {
  const table = findTable(view, tag)
  if (!table) throw new Error(`The font has no ${tag} table`)
  return table
}

interface Format4Segment {
  start: number
  delta: number
  rangeOffset: number
  rangeOffsetAt: number
}

const findFormat4Segment = (
  view: DataView,
  at: number,
  codePoint: number
): Format4Segment | undefined => {
  const segmentCount = view.getUint16(at + FORMAT_4.segCountTimesTwo) / BYTES_PER_UINT16
  const arrayBytes = segmentCount * BYTES_PER_UINT16
  const endCodes = at + FORMAT_4.endCodes
  const startCodes = endCodes + arrayBytes + FORMAT_4.reservedPadBytes
  const deltas = startCodes + arrayBytes
  const rangeOffsets = deltas + arrayBytes
  const index = Array.from({ length: segmentCount }, (_, segment) => segment).find(
    (segment) => view.getUint16(endCodes + segment * BYTES_PER_UINT16) >= codePoint
  )
  if (index === undefined) return undefined
  const rangeOffsetAt = rangeOffsets + index * BYTES_PER_UINT16
  return {
    start: view.getUint16(startCodes + index * BYTES_PER_UINT16),
    delta: view.getInt16(deltas + index * BYTES_PER_UINT16),
    rangeOffset: view.getUint16(rangeOffsetAt),
    rangeOffsetAt
  }
}

// Format 4 maps the Basic Multilingual Plane in segments of consecutive code points.
const readFormat4 =
  (view: DataView, at: number): GlyphLookup =>
  (codePoint) => {
    const segment = findFormat4Segment(view, at, codePoint)
    if (!segment || codePoint < segment.start) return NO_GLYPH
    if (segment.rangeOffset === 0) return (codePoint + segment.delta) & UINT16_MASK
    const glyph = view.getUint16(
      segment.rangeOffsetAt + segment.rangeOffset + (codePoint - segment.start) * BYTES_PER_UINT16
    )
    return glyph === NO_GLYPH ? NO_GLYPH : (glyph + segment.delta) & UINT16_MASK
  }

// Format 12 maps any plane in groups of consecutive code points and glyphs.
const readFormat12 =
  (view: DataView, at: number): GlyphLookup =>
  (codePoint) => {
    const groups = Array.from(
      { length: view.getUint32(at + FORMAT_12.numGroups) },
      (_, index) => at + FORMAT_12.groupsStart + index * FORMAT_12.groupBytes
    )
    const group = groups.find(
      (groupAt) =>
        view.getUint32(groupAt) <= codePoint &&
        codePoint <= view.getUint32(groupAt + FORMAT_12.endChar)
    )
    return group === undefined
      ? NO_GLYPH
      : view.getUint32(group + FORMAT_12.startGlyph) + codePoint - view.getUint32(group)
  }

const readUnicodeSubtables = (view: DataView) => {
  const cmap = requireTable(view, 'cmap').offset
  return Array.from({ length: view.getUint16(cmap + CMAP.numSubtables) }, (_, index) => {
    const at = cmap + CMAP.recordsStart + index * CMAP.recordBytes
    const offset = cmap + view.getUint32(at + CMAP.subtableOffset)
    return { platform: view.getUint16(at), format: view.getUint16(offset), offset }
  }).filter((subtable) => UNICODE_PLATFORMS.has(subtable.platform))
}

/**
 * Reads which characters a TrueType file draws, from its Unicode character map.
 * @param bytes - The font file.
 * @returns A test that is true for a character the file has a glyph for.
 */
export const readCharacterMap = (bytes: Uint8Array): ((codePoint: number) => boolean) => {
  const view = toView(bytes)
  const subtables = readUnicodeSubtables(view)
  const full = subtables.find((subtable) => subtable.format === CMAP_FORMATS.grouped)
  const basic = subtables.find((subtable) => subtable.format === CMAP_FORMATS.segmented)
  const lookup: GlyphLookup = full
    ? readFormat12(view, full.offset)
    : basic
      ? readFormat4(view, basic.offset)
      : () => NO_GLYPH
  return (codePoint) => lookup(codePoint) !== NO_GLYPH
}

/**
 * Reads a font's line metrics the way HarfBuzz does: the OS/2 typographic ones when the font asks
 * for them, the hhea ones otherwise.
 * @param bytes - The font file.
 * @returns Units per em, and the ascender and descender in font units, the descender negative.
 */
export const readLineMetrics = (bytes: Uint8Array): FontLineMetrics => {
  const view = toView(bytes)
  const unitsPerEm = view.getUint16(requireTable(view, 'head').offset + HEAD.unitsPerEm)
  const os2 = findTable(view, 'OS/2')
  if (os2 && view.getUint16(os2.offset + OS2.fsSelection) & OS2.useTypoMetrics) {
    return {
      unitsPerEm,
      ascender: view.getInt16(os2.offset + OS2.typoAscender),
      descender: view.getInt16(os2.offset + OS2.typoDescender)
    }
  }
  const hhea = requireTable(view, 'hhea').offset
  return {
    unitsPerEm,
    ascender: view.getInt16(hhea + HHEA.ascender),
    descender: view.getInt16(hhea + HHEA.descender)
  }
}

const NAME_IDS = { family: 1, subfamily: 2, fullName: 4, postScriptName: 6 }
const WINDOWS_UNICODE = { platform: 3, encoding: 1, language: 0x04_09 }
const NAME_TABLE = { headerBytes: 6, recordBytes: 12 }

const toUint16Bytes = (value: number): number[] => [
  (value >> BYTE_BITS) & BYTE_MASK,
  value & BYTE_MASK
]

const encodeUtf16 = (text: string): number[] =>
  [...text].flatMap((character) => toUint16Bytes(character.codePointAt(0) ?? 0))

const buildNameTable = (family: string): Uint8Array => {
  const entries: [number, string][] = [
    [NAME_IDS.family, family],
    [NAME_IDS.subfamily, 'Regular'],
    [NAME_IDS.fullName, family],
    [NAME_IDS.postScriptName, family.replaceAll(/[^\w-]/g, '')]
  ]
  const strings = entries.map(([, text]) => encodeUtf16(text))
  const stringsStart = NAME_TABLE.headerBytes + entries.length * NAME_TABLE.recordBytes
  const header = [0, entries.length, stringsStart].flatMap(toUint16Bytes)
  const records = entries.flatMap(([nameId], index) => {
    const offset = strings.slice(0, index).reduce((sum, bytes) => sum + bytes.length, 0)
    const length = strings[index]?.length ?? 0
    const { platform, encoding, language } = WINDOWS_UNICODE
    return [platform, encoding, language, nameId, length, offset].flatMap(toUint16Bytes)
  })
  return Uint8Array.from([...header, ...records, ...strings.flat()])
}

const padded = (length: number): number =>
  Math.ceil(length / DIRECTORY.tableAlignment) * DIRECTORY.tableAlignment

const tableChecksum = (bytes: Uint8Array): number => {
  const words = new Uint8Array(padded(bytes.length))
  words.set(bytes)
  const view = toView(words)
  return Array.from({ length: words.length / DIRECTORY.tableAlignment }, (_, index) =>
    view.getUint32(index * DIRECTORY.tableAlignment)
  ).reduce((sum, word) => (sum + word) >>> 0, 0)
}

/**
 * Gives a TrueType file a new family name. A renderer that picks fonts by family name, such as
 * resvg, then finds exactly this file, even beside other subset files of the same family.
 * @param bytes - The font file.
 * @param family - The new family name.
 * @returns A new file with the same tables and a new `name` table.
 */
export const renameFontFamily = (bytes: Uint8Array, family: string): Uint8Array => {
  const nameTable = buildNameTable(family)
  const tables = readTables(toView(bytes)).map((record) =>
    record.tag === 'name'
      ? { ...record, data: nameTable, checksum: tableChecksum(nameTable) }
      : { ...record, data: bytes.subarray(record.offset, record.offset + record.length) }
  )
  const directoryBytes = DIRECTORY.headerBytes + tables.length * DIRECTORY.recordBytes
  const offsets = tables.reduce<number[]>(
    (starts, table, index) => [...starts, (starts[index] ?? 0) + padded(table.data.length)],
    [directoryBytes]
  )
  const output = new Uint8Array(offsets.at(-1) ?? directoryBytes)
  const outputView = toView(output)
  output.set(bytes.subarray(0, DIRECTORY.headerBytes))
  tables.forEach((table, index) => {
    const at = DIRECTORY.headerBytes + index * DIRECTORY.recordBytes
    const offset = offsets[index] ?? 0
    output.set(
      Uint8Array.from([...table.tag].map((character) => character.codePointAt(0) ?? 0)),
      at
    )
    outputView.setUint32(at + RECORD.checksum, table.checksum)
    outputView.setUint32(at + RECORD.offset, offset)
    outputView.setUint32(at + RECORD.length, table.data.length)
    output.set(table.data, offset)
  })
  return output
}
