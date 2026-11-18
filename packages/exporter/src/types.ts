export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** A font's vertical metrics, in font units; the descender is negative, below the baseline. */
export interface FontLineMetrics {
  unitsPerEm: number
  ascender: number
  descender: number
}

export interface SvgExportOptions {
  /**
   * The family a renderer should draw a family list with, such as a downloaded font renamed so it
   * cannot be confused with another; the list itself, with stand-ins added, when undefined.
   */
  resolveFontFamily?: (fontFamily: string) => string | undefined
  /**
   * The metrics of the font a family list draws with. Given them, each line sits on its
   * alphabetic baseline where the editor puts it; without them, lines hang from the top of the box,
   * which is close but depends on how a renderer reads the font's hanging baseline.
   */
  getFontMetrics?: (fontFamily: string) => FontLineMetrics | undefined
}
