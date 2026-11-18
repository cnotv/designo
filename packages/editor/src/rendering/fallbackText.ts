import type { DesignNode } from '@designo/core'
import { layoutFallbackText } from './text/fallbackTextLayout.ts'
import { createBrowserFontStack } from './text/fontFamilyList.ts'
import { getSharedTextRuntime } from './text/sharedTextEngine.ts'
import { toTextLayoutRequest } from './text/textLayoutRequest.ts'
import type { TextBoxSize } from '../editing/types.ts'
import type { FallbackTextLayout, TextLayoutRequest } from './text/types.ts'

type TextContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// Used where a browser reports no font metrics, which the current ones all do.
const DEFAULT_ASCENT_RATIO = 0.8
const DEFAULT_DESCENT_RATIO = 0.2

const fallbackFont = (request: Pick<TextLayoutRequest, 'fontSize' | 'fontFamily'>): string =>
  `${request.fontSize}px ${createBrowserFontStack(
    request.fontFamily,
    getSharedTextRuntime().library.getRegistry(request.fontFamily)
  )}`

/**
 * Lays text out with the browser measuring it, for the paths that draw with Canvas 2D.
 * @param context - Any 2D context; its font is set here.
 * @param request - What the text is and how it sits in its box.
 * @returns The lines and the box, with the same breaking and baselines as the shaped layout.
 */
export const layoutFallbackRequest = (
  context: TextContext,
  request: TextLayoutRequest
): FallbackTextLayout => {
  context.font = fallbackFont(request)
  // The font's own ascent and descent, not the glyphs', so every line sits where CSS puts it.
  const metrics = context.measureText('x')
  return layoutFallbackText(
    {
      text: request.text,
      wrapWidth: request.wrapWidth,
      alignment: request.alignment,
      fontSize: request.fontSize,
      lineHeight: request.lineHeight,
      ascent: metrics.fontBoundingBoxAscent ?? request.fontSize * DEFAULT_ASCENT_RATIO,
      descent: metrics.fontBoundingBoxDescent ?? request.fontSize * DEFAULT_DESCENT_RATIO
    },
    (text) => context.measureText(text).width
  )
}

/**
 * Paints a text node's lines with its box's top-left corner at the origin, honouring its
 * alignment, line height and wrap width as the shaped layout does.
 * @param context - A 2D context, already moved to the node's origin.
 * @param node - The text node.
 * @param layout - The node's fallback layout, when the caller has already worked it out.
 */
export const paintText = (
  context: TextContext,
  node: DesignNode,
  layout: FallbackTextLayout = layoutFallbackRequest(context, toTextLayoutRequest(node))
): void => {
  context.fillStyle = node.fill ?? '#000000'
  context.font = fallbackFont(node)
  context.textBaseline = 'alphabetic'
  // Alignment is the layout's, so the line's x is where it starts whatever the direction.
  context.textAlign = 'left'
  layout.lines.forEach((line) => context.fillText(line.text, line.x, line.baselineY))
}

const measuringCell: { context?: OffscreenCanvasRenderingContext2D | null } = {}

// Made on first use, so importing this module needs no canvas.
const getMeasuringContext = (): OffscreenCanvasRenderingContext2D | null => {
  if (measuringCell.context === undefined && typeof OffscreenCanvas === 'function') {
    measuringCell.context = new OffscreenCanvas(1, 1).getContext('2d')
  }
  return measuringCell.context ?? null
}

/**
 * Sizes a text box with the browser measuring it, for text the shaped layout cannot size yet.
 * @param request - The text and how it sits in its box.
 * @returns The box, or undefined where there is no canvas to measure with.
 */
export const measureFallbackTextBox = (request: TextLayoutRequest): TextBoxSize | undefined => {
  const context = getMeasuringContext()
  if (!context) return undefined
  const { width, height } = layoutFallbackRequest(context, request)
  return { width, height }
}
