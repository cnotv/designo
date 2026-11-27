import { crc32, deflateSync } from 'node:zlib'
import type { RgbaImage } from './types.ts'

const SIGNATURE = Buffer.from('\u0089PNG\r\n\u001A\n', 'latin1')
const BIT_DEPTH = 8
const COLOR_TYPE_RGBA = 6
const CHANNELS = 4
const NO_FILTER = 0

const uint32 = (value: number): Buffer => {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32BE(value >>> 0)
  return bytes
}

const chunk = (type: string, data: Uint8Array): Buffer => {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  return Buffer.concat([uint32(data.length), typeAndData, uint32(crc32(typeAndData))])
}

const header = (image: RgbaImage): Buffer =>
  Buffer.concat([
    uint32(image.width),
    uint32(image.height),
    Uint8Array.of(BIT_DEPTH, COLOR_TYPE_RGBA, 0, 0, 0)
  ])

// Every row starts with its filter type; none is used, as the size of a report image hardly matters.
const scanlines = (image: RgbaImage): Buffer => {
  const rowBytes = image.width * CHANNELS
  return Buffer.concat(
    Array.from({ length: image.height }, (_, row) =>
      Buffer.concat([
        Uint8Array.of(NO_FILTER),
        image.pixels.subarray(row * rowBytes, (row + 1) * rowBytes)
      ])
    )
  )
}

/**
 * Writes an RGBA image as a PNG file, so a diff can be looked at without another dependency.
 * @param image - Unpremultiplied RGBA.
 * @returns The PNG bytes.
 */
export const encodePng = (image: RgbaImage): Buffer =>
  Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header(image)),
    chunk('IDAT', deflateSync(scanlines(image))),
    chunk('IEND', new Uint8Array())
  ])
