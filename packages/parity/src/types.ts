import type { DesignDocument } from '@designo/core'

/** One document that shows one effect, drawn by every renderer and compared. */
export interface ParityCase {
  /** A stable, file-name safe name, such as `blur`. */
  name: string
  /** What the case shows, for the report. */
  description: string
  document: DesignDocument
  /** The frame every renderer draws: its box is the image. */
  frameId: string
}

/** An image as unpremultiplied RGBA bytes, row by row from the top left. */
export interface RgbaImage {
  width: number
  height: number
  pixels: Uint8Array
}

/** The renderers compared against the reference, which is the SVG export drawn by resvg. */
export type ComparedRenderer = 'webgl' | 'pdf'

/**
 * How far one renderer may drift from the reference before the run fails. A pixel differs when
 * any colour channel is further apart than `channelThreshold`, out of 255.
 */
export interface ParityTolerance {
  channelThreshold: number
  /** The share of the image's pixels, from 0 to 1, that may differ. */
  maxDifferingShare: number
}

/** What comparing two images found. */
export interface ImageComparison {
  /** The pixels that differ by more than the threshold. */
  differingPixels: number
  differingShare: number
  /** The largest difference of any channel, out of 255. */
  largestChannelDifference: number
  /** The reference, faded, with the differing pixels in red. */
  diffImage: RgbaImage
}

/** One renderer's result for one case. */
export interface RendererResult {
  renderer: ComparedRenderer
  comparison: ImageComparison
  tolerance: ParityTolerance
  passed: boolean
}

export interface CaseResult {
  name: string
  description: string
  results: readonly RendererResult[]
}
