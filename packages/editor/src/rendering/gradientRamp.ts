import type { Gradient } from '@designo/core'
import { parseHexColor } from './scene.ts'
import type { RgbaColor } from './types.ts'

/** How many colours a ramp holds along its length. */
export const RAMP_WIDTH = 256

const CHANNEL_MAX = 255
const CHANNELS = 4

const mixChannel = (from: number, to: number, share: number): number => from + (to - from) * share

const colorAt = (gradient: Gradient, position: number): RgbaColor => {
  const stops = gradient.stops.map((stop) => ({
    offset: stop.offset,
    color: parseHexColor(stop.color)
  }))
  const first = stops[0]
  const last = stops.at(-1)
  if (!first || !last) return parseHexColor(null)
  if (position <= first.offset) return first.color
  if (position >= last.offset) return last.color
  const afterIndex = stops.findIndex((stop) => stop.offset >= position)
  const before = stops[afterIndex - 1]
  const after = stops[afterIndex]
  if (!before || !after) return last.color
  const span = after.offset - before.offset
  const share = span === 0 ? 1 : (position - before.offset) / span
  return {
    red: mixChannel(before.color.red, after.color.red, share),
    green: mixChannel(before.color.green, after.color.green, share),
    blue: mixChannel(before.color.blue, after.color.blue, share),
    alpha: mixChannel(before.color.alpha, after.color.alpha, share)
  }
}

/**
 * Bakes a gradient into one row of straight (not premultiplied) RGBA bytes, mixed between its
 * stops the way SVG mixes them, so the shader only has to look a position up.
 * @param gradient - The gradient to bake.
 * @returns `RAMP_WIDTH` pixels of four bytes.
 */
export const bakeGradientRamp = (gradient: Gradient): Uint8Array =>
  Uint8Array.from(
    Array.from({ length: RAMP_WIDTH }, (_, pixel) => {
      const { red, green, blue, alpha } = colorAt(gradient, pixel / (RAMP_WIDTH - 1))
      return [red, green, blue, alpha].map((channel) => Math.round(channel * CHANNEL_MAX))
    }).flat()
  ).slice(0, RAMP_WIDTH * CHANNELS)
