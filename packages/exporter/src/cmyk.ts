import type { CmykColor } from './types.ts'

const CHANNEL_MAXIMUM = 255
const PERCENT = 100
const HEX_RADIX = 16
// One decimal of a percent is finer than any press holds, and keeps the content stream short.
const PERCENT_PRECISION = 10

const RED_START = 1
const GREEN_START = 3
const BLUE_START = 5
const CHANNEL_LENGTH = 2

const readChannel = (hex: string, start: number): number =>
  Number.parseInt(hex.slice(start, start + CHANNEL_LENGTH), HEX_RADIX) / CHANNEL_MAXIMUM

const toPercent = (fraction: number): number =>
  Math.round(fraction * PERCENT * PERCENT_PRECISION) / PERCENT_PRECISION

/**
 * Converts an sRGB colour to CMYK by the device formula: black is what the brightest channel
 * lacks, and each ink makes up what its channel lacks beyond that. No profile is involved, so the
 * result is not colour managed; pure black comes out as black ink alone.
 * @param hex - A colour as `#rrggbb`; any alpha after it is ignored.
 * @returns Cyan, magenta, yellow and black, each from 0 to 100.
 */
export const hexToCmyk = (hex: string): CmykColor => {
  const channels = [RED_START, GREEN_START, BLUE_START].map((start) => readChannel(hex, start))
  const black = 1 - Math.max(...channels)
  if (black === 1) return [0, 0, 0, PERCENT]
  const [cyan = 0, magenta = 0, yellow = 0] = channels.map(
    (channel) => (1 - channel - black) / (1 - black)
  )
  return [toPercent(cyan), toPercent(magenta), toPercent(yellow), toPercent(black)]
}
