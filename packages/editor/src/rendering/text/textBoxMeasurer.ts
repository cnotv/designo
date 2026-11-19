import { estimateTextBox } from '../../editing/geometry.ts'
import type { TextBoxMeasurer, TextBoxSize } from '../../editing/types.ts'
import type { TextEngine, TextLayoutRequest } from '@designo/text'

const toLayoutRequest = (request: Parameters<TextBoxMeasurer>[0]): TextLayoutRequest => ({
  text: request.text,
  fontFamily: request.fontFamily,
  fontWeight: request.fontWeight,
  fontStyle: request.fontStyle,
  letterSpacing: request.letterSpacing,
  fontSize: request.fontSize,
  lineHeight: request.lineHeight,
  alignment: request.textAlign,
  wrapWidth: request.wrapWidth
})

/**
 * Makes the measurer the editor sizes text boxes with. It asks the text engine, which is what the
 * canvas draws, so a box is exactly as wide and tall as its text is drawn. Asking also starts
 * loading the fonts the text needs. Until they have, the browser measures the text, and where it
 * cannot, a character-count estimate stands in.
 * @param engine - The engine the canvas draws with.
 * @param measureFallback - Measures with the browser; undefined where there is no canvas.
 * @returns The measurer.
 */
export const createTextBoxMeasurer =
  (
    engine: Pick<TextEngine, 'getLayout'>,
    measureFallback: (request: TextLayoutRequest) => TextBoxSize | undefined
  ): TextBoxMeasurer =>
  (request) => {
    const layoutRequest = toLayoutRequest(request)
    const layout = engine.getLayout(layoutRequest)
    if (layout) return { width: layout.width, height: layout.height }
    return measureFallback(layoutRequest) ?? estimateTextBox(request)
  }
