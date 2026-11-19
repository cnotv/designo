import type { DesignNode, TextFace } from '@designo/core'

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

/** One line of a laid-out text: the slice `[start, end)` of the node's text it holds. */
export interface TextLineRange {
  start: number
  end: number
}

export interface SvgExportOptions {
  /**
   * Where a fixed-width text node breaks its lines, from the layout engine the editor draws with.
   * Without it, or when it returns undefined, text breaks only at the line breaks it carries.
   */
  getTextLines?: (node: DesignNode) => readonly TextLineRange[] | undefined
  /**
   * The family a renderer should draw a family list, weight and style with, such as a downloaded
   * font renamed so it
   * cannot be confused with another; the list itself, with stand-ins added, when undefined.
   */
  resolveFontFamily?: (face: TextFace) => string | undefined
  /**
   * The metrics of the font a family list draws with. Given them, each line sits on its
   * alphabetic baseline where the editor puts it; without them, lines hang from the top of the box,
   * which is close but depends on how a renderer reads the font's hanging baseline.
   */
  getFontMetrics?: (face: TextFace) => FontLineMetrics | undefined
}
