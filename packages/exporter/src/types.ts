import type { DesignNode, TextFace } from '@designo/core'
import type { TextLayout } from '@designo/text'

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
  /**
   * The `href` an image node is drawn from, usually a data URI of the stored picture. Without it,
   * or when it returns undefined, the node draws as its fill, a placeholder.
   */
  getImageHref?: (assetId: string) => string | undefined
}

/** Cyan, magenta, yellow and black, each from 0 to 100, as pdfkit takes a DeviceCMYK colour. */
export type CmykColor = [number, number, number, number]

/** The colour space vector colour is written in: sRGB as designed, or converted to print inks. */
export type PdfColorSpace = 'rgb' | 'cmyk'

/** A node drawn to a PNG, covering the box `getExportBounds` gives for it. */
export type RasterizedNode = Uint8Array

export interface PdfExportOptions {
  /**
   * How a text node's glyphs are placed, from the layout engine the editor draws with. A text
   * without a layout fails the export, as it has no font to be set in.
   */
  getTextLayout: (node: DesignNode) => TextLayout | undefined
  /** The bytes of a font file by the id its layout names, embedded in the PDF. */
  getFontBytes: (fontId: string) => Uint8Array | undefined
  /**
   * Draws one node, with its blur and shadow, to a PNG at the density it should print at. A PDF
   * has no blur, so these nodes are images; without it they are drawn sharp.
   */
  rasterizeNode?: (nodeId: string) => Promise<RasterizedNode | undefined>
  /**
   * The bytes of a stored picture by its asset id. PNG and JPEG are embedded as they are; WebP and
   * GIF go through `rasterizeNode`. Without them an image node is drawn as its fill.
   */
  getImageBytes?: (assetId: string) => Uint8Array | undefined
  /**
   * Draws crop marks at the corners of each page's trim box, in a slug the page grows by beyond its
   * bleed. A page with bleed always gets a BleedBox and a TrimBox; the marks only add room.
   */
  trimMarks?: boolean
  /**
   * The colour space of fills, strokes, gradients, text and trim marks: `rgb` by default, or `cmyk`
   * for DeviceCMYK, converted from sRGB by `hexToCmyk`. Images and nodes drawn to images stay RGB.
   */
  colorSpace?: PdfColorSpace
}
