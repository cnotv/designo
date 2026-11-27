import type { ImageComparison, ParityTolerance, RgbaImage } from './types.ts'

const CHANNELS = 4
const OPAQUE = 255
// The reference shows through the diff image at a quarter strength, so the red marks stand out.
const FADED_SHARE = 0.25
const DIFF_MARK = [OPAQUE, 0, 0, OPAQUE] as const

const blendOverWhite = (channel: number, alpha: number): number =>
  Math.round((channel * alpha + OPAQUE * (OPAQUE - alpha)) / OPAQUE)

/**
 * Lays an image over white, so a transparent corner and a white one compare as the same.
 * @param image - Unpremultiplied RGBA.
 * @returns The opaque image.
 */
export const compositeOverWhite = (image: RgbaImage): RgbaImage => ({
  ...image,
  pixels: Uint8Array.from(image.pixels, (value, index) => {
    const channel = index % CHANNELS
    const alpha = image.pixels[index - channel + CHANNELS - 1] ?? OPAQUE
    return channel === CHANNELS - 1 ? OPAQUE : blendOverWhite(value, alpha)
  })
})

const largestDifferenceAt = (first: RgbaImage, second: RgbaImage, pixel: number): number =>
  Math.max(
    ...[0, 1, 2, 3].map((channel) =>
      Math.abs(
        (first.pixels[pixel * CHANNELS + channel] ?? 0) -
          (second.pixels[pixel * CHANNELS + channel] ?? 0)
      )
    )
  )

const fadedValue = (value: number): number => Math.round(OPAQUE - (OPAQUE - value) * FADED_SHARE)

const drawDiffImage = (reference: RgbaImage, differing: readonly boolean[]): RgbaImage => ({
  width: reference.width,
  height: reference.height,
  pixels: Uint8Array.from(reference.pixels, (value, index) => {
    const channel = index % CHANNELS
    if (differing[Math.floor(index / CHANNELS)]) return DIFF_MARK[channel] ?? OPAQUE
    return channel === CHANNELS - 1 ? OPAQUE : fadedValue(value)
  })
})

/**
 * Compares two opaque images of one size, pixel by pixel.
 * @param reference - The image the other should match.
 * @param candidate - The image under test.
 * @param tolerance - How far a channel may be off before its pixel counts as different.
 * @returns How many pixels differ, the largest difference, and an image that marks them.
 * @throws {Error} When the images are not the same size.
 */
export const compareImages = (
  reference: RgbaImage,
  candidate: RgbaImage,
  tolerance: ParityTolerance
): ImageComparison => {
  if (reference.width !== candidate.width || reference.height !== candidate.height)
    throw new Error(
      `The images differ in size: ${reference.width}x${reference.height} and ${candidate.width}x${candidate.height}`
    )
  const pixelCount = reference.width * reference.height
  const differences = Array.from({ length: pixelCount }, (_, pixel) =>
    largestDifferenceAt(reference, candidate, pixel)
  )
  const differing = differences.map((difference) => difference > tolerance.channelThreshold)
  const differingPixels = differing.filter(Boolean).length
  return {
    differingPixels,
    differingShare: pixelCount === 0 ? 0 : differingPixels / pixelCount,
    largestChannelDifference: differences.reduce((largest, next) => Math.max(largest, next), 0),
    diffImage: drawDiffImage(reference, differing)
  }
}

/**
 * Whether a comparison is within its tolerance.
 * @param comparison - What comparing the images found.
 * @param tolerance - The share of pixels that may differ.
 * @returns True when the renderer is close enough to the reference.
 */
export const isWithinTolerance = (
  comparison: ImageComparison,
  tolerance: ParityTolerance
): boolean => comparison.differingShare <= tolerance.maxDifferingShare
