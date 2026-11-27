import { describe, expect, it } from 'vitest'
import { compareImages, compositeOverWhite, isWithinTolerance } from './compare.ts'
import type { RgbaImage } from './types.ts'

const TOLERANCE = { channelThreshold: 16, maxDifferingShare: 0.25 }

const solid = (width: number, height: number, rgba: readonly number[]): RgbaImage => ({
  width,
  height,
  pixels: Uint8Array.from({ length: width * height * 4 }, (_, index) => rgba[index % 4] ?? 0)
})

const withPixel = (image: RgbaImage, pixel: number, rgba: readonly number[]): RgbaImage => ({
  ...image,
  pixels: Uint8Array.from(image.pixels, (value, index) =>
    Math.floor(index / 4) === pixel ? (rgba[index % 4] ?? 0) : value
  )
})

describe('compositeOverWhite', () => {
  it('turns a transparent pixel white and keeps an opaque one', () => {
    const image = withPixel(solid(2, 1, [0, 0, 0, 0]), 1, [10, 20, 30, 255])
    expect([...compositeOverWhite(image).pixels]).toEqual([255, 255, 255, 255, 10, 20, 30, 255])
  })

  it('mixes a half transparent pixel with white', () => {
    expect([...compositeOverWhite(solid(1, 1, [0, 0, 0, 128])).pixels]).toEqual([
      127, 127, 127, 255
    ])
  })
})

describe('compareImages', () => {
  const reference = solid(2, 2, [100, 100, 100, 255])

  it('finds no difference between equal images', () => {
    const comparison = compareImages(reference, reference, TOLERANCE)
    expect(comparison.differingPixels).toBe(0)
    expect(comparison.largestChannelDifference).toBe(0)
    expect(isWithinTolerance(comparison, TOLERANCE)).toBe(true)
  })

  it('ignores a difference within the channel threshold but reports its size', () => {
    const comparison = compareImages(
      reference,
      withPixel(reference, 0, [110, 100, 100, 255]),
      TOLERANCE
    )
    expect(comparison.differingPixels).toBe(0)
    expect(comparison.largestChannelDifference).toBe(10)
  })

  it('counts and marks in red the pixels beyond the threshold', () => {
    const candidate = withPixel(withPixel(reference, 0, [0, 100, 100, 255]), 3, [100, 100, 0, 255])
    const comparison = compareImages(reference, candidate, TOLERANCE)
    expect(comparison.differingPixels).toBe(2)
    expect(comparison.differingShare).toBe(0.5)
    expect(isWithinTolerance(comparison, TOLERANCE)).toBe(false)
    expect([...comparison.diffImage.pixels.subarray(0, 4)]).toEqual([255, 0, 0, 255])
    // The others show the reference faded towards white.
    expect([...comparison.diffImage.pixels.subarray(4, 8)]).toEqual([216, 216, 216, 255])
  })

  it('refuses images of different sizes', () => {
    expect(() => compareImages(reference, solid(1, 2, [0, 0, 0, 255]), TOLERANCE)).toThrow(
      'The images differ in size'
    )
  })
})
