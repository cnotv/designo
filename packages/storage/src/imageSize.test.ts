import { describe, expect, it } from 'vitest'
import { readImageSize } from './imageSize.ts'

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)

const png = (width: number, height: number): Uint8Array => {
  const data = new Uint8Array(24)
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(data.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return data
}

const gif = (width: number, height: number): Uint8Array => {
  const data = new Uint8Array(10)
  data.set(new TextEncoder().encode('GIF89a'))
  const view = new DataView(data.buffer)
  view.setUint16(6, width, true)
  view.setUint16(8, height, true)
  return data
}

// A JPEG with an APP0 segment to skip, then a baseline frame header.
const jpeg = (width: number, height: number): Uint8Array => {
  const data = new Uint8Array(25)
  data.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46])
  data.set([0xff, 0xc0, 0x00, 0x0b, 0x08], 10)
  const view = new DataView(data.buffer)
  view.setUint16(15, height)
  view.setUint16(17, width)
  return data
}

const webpHeader = (chunk: string): Uint8Array => {
  const data = new Uint8Array(40)
  const encoder = new TextEncoder()
  data.set(encoder.encode('RIFF'))
  data.set(encoder.encode('WEBP'), 8)
  data.set(encoder.encode(chunk), 12)
  return data
}

describe('readImageSize', () => {
  it('reads a PNG', () => {
    expect(readImageSize(png(640, 480))).toEqual({ width: 640, height: 480 })
  })

  it('reads a GIF', () => {
    expect(readImageSize(gif(32, 16))).toEqual({ width: 32, height: 16 })
  })

  it('reads a JPEG past the segments before its frame header', () => {
    expect(readImageSize(jpeg(300, 200))).toEqual({ width: 300, height: 200 })
  })

  it('reads a lossy WebP', () => {
    const data = webpHeader('VP8 ')
    const view = new DataView(data.buffer)
    view.setUint16(26, 120, true)
    view.setUint16(28, 90, true)
    expect(readImageSize(data)).toEqual({ width: 120, height: 90 })
  })

  it('reads a lossless WebP', () => {
    const data = webpHeader('VP8L')
    // 800 by 600, as the 14 bit fields minus one are packed after the signature byte.
    const packed = (800 - 1) | ((600 - 1) << 14)
    new DataView(data.buffer).setUint32(21, packed, true)
    expect(readImageSize(data)).toEqual({ width: 800, height: 600 })
  })

  it('reads an extended WebP', () => {
    const data = webpHeader('VP8X')
    data.set([0x0f, 0x01, 0x00], 24)
    data.set([0xc7, 0x00, 0x00], 27)
    expect(readImageSize(data)).toEqual({ width: 272, height: 200 })
  })

  it('has no size for bytes that are cut short or are not a picture', () => {
    expect(readImageSize(bytes(0x89, 0x50))).toBeUndefined()
    expect(readImageSize(new TextEncoder().encode('hello world, not a picture'))).toBeUndefined()
  })
})
