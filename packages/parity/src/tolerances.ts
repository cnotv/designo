import type { ComparedRenderer, ParityTolerance } from './types.ts'

/**
 * How far each renderer may drift from resvg, for every case. Anti-aliased edges differ by up to
 * about 1.1% of a case's pixels; an effect a renderer drops, such as a blur or a blend mode, moves
 * 11% or more. See documentation/docs/guides/render-parity.md.
 */
export const PARITY_TOLERANCES: Record<ComparedRenderer, ParityTolerance> = {
  webgl: { channelThreshold: 16, maxDifferingShare: 0.02 },
  pdf: { channelThreshold: 16, maxDifferingShare: 0.02 }
}
