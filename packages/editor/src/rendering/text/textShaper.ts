import { splitIntoFontRuns } from './fontRegistry.ts'
import type {
  FontLineMetrics,
  FontRegistry,
  FontRun,
  ShapedRun,
  ShapingFont,
  TextDirection,
  TextShaper
} from './types.ts'

const requireFont = (registry: FontRegistry, fontId: string): { id: string; font: ShapingFont } => {
  const font = registry.getFont(fontId)
  if (font) return { id: fontId, font }
  // A script font still downloading draws with the default font until it arrives.
  const fallback = registry.getFont(registry.catalog.defaultFontId)
  if (fallback) return { id: registry.catalog.defaultFontId, font: fallback }
  throw new Error('No font is loaded; await loadFontsForText before shaping')
}

const shapeFontRun = (
  registry: FontRegistry,
  text: string,
  run: FontRun,
  direction: TextDirection
): ShapedRun => {
  const { id, font } = requireFont(registry, run.fontId)
  return {
    fontId: id,
    direction,
    unitsPerEm: font.metrics.unitsPerEm,
    glyphs: font
      .shape(text.slice(run.start, run.end), direction)
      .map((glyph) => ({ ...glyph, cluster: glyph.cluster + run.start }))
  }
}

/**
 * Builds the shaper that layout uses. It reads fonts from the registry, so fonts must have been
 * loaded with `loadFontsForText` for the text first.
 * @param registry - The fonts.
 * @returns The shaper.
 */
export const createTextShaper = (registry: FontRegistry): TextShaper => ({
  shapeRuns: (text, direction) => {
    const shaped = splitIntoFontRuns(text, registry.catalog).map((run) =>
      shapeFontRun(registry, text, run, direction)
    )
    return direction === 'rtl' ? shaped.toReversed() : shaped
  },
  getPrimaryMetrics: (): FontLineMetrics =>
    requireFont(registry, registry.catalog.defaultFontId).font.metrics
})
