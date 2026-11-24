import { detectImageType } from './assets.ts'

/** A picture's size in pixels. */
export interface ImageSize {
  width: number
  height: number
}

const PNG = { width: 16, height: 20, minimumLength: 24 }
const GIF = { width: 6, height: 8, minimumLength: 10 }
const WEBP = { chunk: 12, lossy: 26, lossless: 21, extended: 24, minimumLength: 30 }
const JPEG = { firstSegment: 2, segmentHeader: 4, frameHeight: 5, frameWidth: 7 }
const WEBP_LOSSY_MASK = 0x3fff
const WEBP_LOSSLESS_FIELD = 14
const WEBP_LOSSLESS_MASK = 0x3fff
const WEBP_EXTENDED_HEIGHT_OFFSET = 3
const FOUR_BYTES = 4
const BYTE_BITS = 8
const MARKER_PREFIX = 0xff
// Frame headers carry the size; the markers between C0 and CF that are not frames are listed.
const FIRST_FRAME_MARKER = 0xc0
const LAST_FRAME_MARKER = 0xcf
const HUFFMAN_TABLE_MARKER = 0xc4
const JPEG_EXTENSION_MARKER = 0xc8
const ARITHMETIC_CONDITIONING_MARKER = 0xcc
const NOT_FRAME_MARKERS = new Set([
  HUFFMAN_TABLE_MARKER,
  JPEG_EXTENSION_MARKER,
  ARITHMETIC_CONDITIONING_MARKER
])

const view = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const readUint24 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) |
  ((bytes[offset + 1] ?? 0) << BYTE_BITS) |
  ((bytes[offset + 2] ?? 0) << (BYTE_BITS * 2))

const readPng = (bytes: Uint8Array): ImageSize | undefined =>
  bytes.length < PNG.minimumLength
    ? undefined
    : { width: view(bytes).getUint32(PNG.width), height: view(bytes).getUint32(PNG.height) }

const readGif = (bytes: Uint8Array): ImageSize | undefined =>
  bytes.length < GIF.minimumLength
    ? undefined
    : {
        width: view(bytes).getUint16(GIF.width, true),
        height: view(bytes).getUint16(GIF.height, true)
      }

// Segments are a marker, a type and a length that includes itself; the first frame header holds
// the size.
const readJpeg = (bytes: Uint8Array, offset = JPEG.firstSegment): ImageSize | undefined => {
  if (offset + JPEG.segmentHeader > bytes.length || bytes[offset] !== MARKER_PREFIX) {
    return undefined
  }
  const type = bytes[offset + 1] ?? 0
  const isFrame =
    type >= FIRST_FRAME_MARKER && type <= LAST_FRAME_MARKER && !NOT_FRAME_MARKERS.has(type)
  if (isFrame) {
    return offset + JPEG.frameWidth + 2 > bytes.length
      ? undefined
      : {
          width: view(bytes).getUint16(offset + JPEG.frameWidth),
          height: view(bytes).getUint16(offset + JPEG.frameHeight)
        }
  }
  return readJpeg(bytes, offset + 2 + view(bytes).getUint16(offset + 2))
}

const readWebp = (bytes: Uint8Array): ImageSize | undefined => {
  if (bytes.length < WEBP.minimumLength) return undefined
  const chunk = new TextDecoder().decode(bytes.subarray(WEBP.chunk, WEBP.chunk + FOUR_BYTES))
  if (chunk === 'VP8 ') {
    return {
      width: view(bytes).getUint16(WEBP.lossy, true) & WEBP_LOSSY_MASK,
      height: view(bytes).getUint16(WEBP.lossy + 2, true) & WEBP_LOSSY_MASK
    }
  }
  if (chunk === 'VP8L') {
    const packed = view(bytes).getUint32(WEBP.lossless, true)
    return {
      width: (packed & WEBP_LOSSLESS_MASK) + 1,
      height: ((packed >>> WEBP_LOSSLESS_FIELD) & WEBP_LOSSLESS_MASK) + 1
    }
  }
  return chunk === 'VP8X'
    ? {
        width: readUint24(bytes, WEBP.extended) + 1,
        height: readUint24(bytes, WEBP.extended + WEBP_EXTENDED_HEIGHT_OFFSET) + 1
      }
    : undefined
}

/**
 * Reads a picture's size in pixels from its header, so a node can start at the picture's own
 * proportions.
 * @param bytes - The picture's file contents.
 * @returns The size, or undefined for a type the store does not keep or a header cut short.
 */
export const readImageSize = (bytes: Uint8Array): ImageSize | undefined => {
  const readers = { png: readPng, jpg: readJpeg, gif: readGif, webp: readWebp }
  const type = detectImageType(bytes)
  return type ? readers[type.extension](bytes) : undefined
}
