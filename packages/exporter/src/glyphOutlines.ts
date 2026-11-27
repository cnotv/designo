import type { OutlinedGlyph } from './types.ts'

const COORDINATE_DECIMALS = 3
// A command letter, or a number in the forms HarfBuzz writes: signed, decimal, maybe exponent.
const PATH_TOKEN = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-z]/gi
const COMMAND = /^[a-z]$/i
const PAIR_SIZE = 2

const formatCoordinate = (value: number): string =>
  String(Number(value.toFixed(COORDINATE_DECIMALS)))

/**
 * Moves a glyph outline from font units, y up, to the text box: scaled, flipped and placed at its
 * origin. HarfBuzz writes only absolute commands whose arguments are points (M, L, Q, C, Z), so
 * every pair of numbers is a point to map.
 * @param glyph - The outline and where it goes.
 * @param origin - The top left corner of the text box.
 * @param origin.x - Its x.
 * @param origin.y - Its y.
 * @returns The outline as path data in the text box's space.
 */
export const placeGlyphOutline = (
  glyph: Pick<OutlinedGlyph, 'pathData' | 'x' | 'y' | 'scale'>,
  origin: { x: number; y: number }
): string => {
  const tokens = glyph.pathData.match(PATH_TOKEN) ?? []
  return tokens
    .reduce<{ parts: string[]; numbers: number }>(
      (state, token) => {
        if (COMMAND.test(token)) return { parts: [...state.parts, token], numbers: 0 }
        const value = Number(token)
        const isX = state.numbers % PAIR_SIZE === 0
        const placed = isX
          ? origin.x + glyph.x + value * glyph.scale
          : origin.y + glyph.y - value * glyph.scale
        const separator = state.numbers === 0 ? '' : isX ? ' ' : ','
        return {
          parts: [...state.parts, `${separator}${formatCoordinate(placed)}`],
          numbers: state.numbers + 1
        }
      },
      { parts: [], numbers: 0 }
    )
    .parts.join('')
}

/**
 * Joins the outlines of a text's glyphs into one path per colour, so a text is a handful of paths
 * however long it is.
 * @param glyphs - The text's glyphs.
 * @param origin - The top left corner of the text box.
 * @param origin.x - Its x.
 * @param origin.y - Its y.
 * @returns Path data for each colour; the key undefined holds the glyphs in the node's own fill.
 */
export const groupGlyphOutlinesByFill = (
  glyphs: readonly OutlinedGlyph[],
  origin: { x: number; y: number }
): Map<string | undefined, string> =>
  new Map(
    [...new Set(glyphs.map((glyph) => glyph.fill))].map((fill) => [
      fill,
      glyphs
        .filter((glyph) => glyph.fill === fill && glyph.pathData !== '')
        .map((glyph) => placeGlyphOutline(glyph, origin))
        .join('')
    ])
  )
