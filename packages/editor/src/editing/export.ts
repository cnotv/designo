import type { DesignDocument } from '@designo/core'
import type { ExportFormat, PixelSize } from './types.ts'

export const EXPORT_SCALES: readonly number[] = [1, 2, 3]
export const MIN_EXPORT_SCALE = 1
export const MAX_EXPORT_SCALE = 3
// Browsers refuse canvases past roughly this side, so a huge page at 3x is shrunk to fit.
export const MAX_RASTER_SIDE = 8192

const FALLBACK_FILE_NAME = 'export'
const FORBIDDEN_FILE_NAME_CHARACTERS = /["*/:<>?\\|]+/g
const FIRST_PRINTABLE_CODE = 32
const LEADING_OR_TRAILING_DOTS_AND_SPACES = /^[\s.]+|[\s.]+$/g

/**
 * Turns a layer name into something every file system accepts.
 * @param name - The layer name.
 * @returns The name without path separators, reserved characters or edge dots.
 */
export const sanitizeFileName = (name: string): string => {
  const cleaned = [...name]
    .filter((character) => (character.codePointAt(0) ?? 0) >= FIRST_PRINTABLE_CODE)
    .join('')
    .replaceAll(FORBIDDEN_FILE_NAME_CHARACTERS, '-')
    .replaceAll(LEADING_OR_TRAILING_DOTS_AND_SPACES, '')
  return cleaned === '' ? FALLBACK_FILE_NAME : cleaned
}

/**
 * Keeps a pixel density inside what the export offers.
 * @param scale - The requested density.
 * @returns A whole number from the minimum to the maximum scale.
 */
export const clampExportScale = (scale: number): number =>
  Number.isFinite(scale)
    ? Math.min(MAX_EXPORT_SCALE, Math.max(MIN_EXPORT_SCALE, Math.round(scale)))
    : MIN_EXPORT_SCALE

/**
 * Names the downloaded file: the layer name, plus `@2x` and the like for a PNG.
 * @param name - The layer name.
 * @param format - The export format.
 * @param scale - The PNG pixel density.
 * @returns The file name with its extension.
 */
export const buildExportFileName = (name: string, format: ExportFormat, scale: number): string => {
  const baseName = sanitizeFileName(name)
  return format === 'svg' ? `${baseName}.svg` : `${baseName}@${clampExportScale(scale)}x.png`
}

/**
 * Picks what to export: every selected layer that still exists, or the page when nothing is.
 * @param document - The document.
 * @param selection - The selected node ids.
 * @returns The node ids to export, in selection order.
 */
export const getExportTargetIds = (
  document: DesignDocument,
  selection: readonly string[]
): string[] => {
  const existing = selection.filter((nodeId) => document.nodes[nodeId] !== undefined)
  return existing.length > 0 ? existing : [document.rootId]
}

/**
 * Sizes the bitmap of a PNG, shrinking it when the scaled image would pass the canvas limit.
 * @param size - The SVG size in world units.
 * @param scale - The requested pixel density.
 * @returns The whole-pixel bitmap size, at least one pixel on each side.
 */
export const getRasterSize = (size: PixelSize, scale: number): PixelSize => {
  const requested = clampExportScale(scale)
  const longestSide = Math.max(size.width, size.height) * requested
  const fit = longestSide > MAX_RASTER_SIDE ? MAX_RASTER_SIDE / longestSide : 1
  return {
    width: Math.max(1, Math.round(size.width * requested * fit)),
    height: Math.max(1, Math.round(size.height * requested * fit))
  }
}
