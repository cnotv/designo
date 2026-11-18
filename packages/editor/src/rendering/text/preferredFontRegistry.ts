import { splitIntoFontRuns } from './fontRegistry.ts'
import type { FontRegistry } from './types.ts'

/**
 * Looks at a registry as if one font were the default: the font a node's family list names
 * becomes the primary, which sets the baseline and wins any character it covers. The fonts load
 * once in the shared registry underneath.
 * @param base - The shared registry.
 * @param preferredFontId - The font to prefer.
 * @returns A registry whose catalog lists the preferred font first and as the default.
 */
export const createPreferredFontRegistry = (
  base: FontRegistry,
  preferredFontId: string
): FontRegistry => {
  const preferred = base.catalog.fonts.find((font) => font.id === preferredFontId)
  if (!preferred || preferredFontId === base.catalog.defaultFontId) return base
  const catalog = {
    defaultFontId: preferredFontId,
    fonts: [preferred, ...base.catalog.fonts.filter((font) => font.id !== preferredFontId)]
  }
  return {
    catalog,
    loadFont: base.loadFont,
    getFont: base.getFont,
    loadFontsForText: async (text) => {
      const neededIds = new Set([
        preferredFontId,
        ...splitIntoFontRuns(text, catalog).map((run) => run.fontId)
      ])
      await Promise.all([...neededIds].map(base.loadFont))
    }
  }
}
