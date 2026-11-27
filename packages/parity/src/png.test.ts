import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { encodePng } from './png.ts'

const IHDR_DATA_START = 16
const IDAT_LENGTH_START = 33

describe('encodePng', () => {
  it('writes the signature, the size and every row of pixels', () => {
    const pixels = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 0])
    const png = encodePng({ width: 2, height: 2, pixels })
    expect([...png.subarray(1, 4)].map((code) => String.fromCodePoint(code)).join('')).toBe('PNG')
    expect(png.readUInt32BE(IHDR_DATA_START)).toBe(2)
    expect(png.readUInt32BE(IHDR_DATA_START + 4)).toBe(2)
    const dataLength = png.readUInt32BE(IDAT_LENGTH_START)
    const data = inflateSync(
      png.subarray(IDAT_LENGTH_START + 8, IDAT_LENGTH_START + 8 + dataLength)
    )
    // Each row is its filter byte, 0, then its pixels.
    expect([...data]).toEqual([0, ...pixels.subarray(0, 8), 0, ...pixels.subarray(8)])
    expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND')
  })
})
