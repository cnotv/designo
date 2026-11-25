import { clampTextSpans } from '@designo/core'
import type { DesignDocument, DesignNode, DesignOperation } from '@designo/core'
import { createDeleteOperations, createPropertyOperations } from './operations.ts'
import type { TextBoxMeasurer, TextEditSession, TextOverlayLayout, Viewport } from './types.ts'
import { worldToScreen } from './viewport.ts'

/**
 * Works out where the text editor overlay goes so the text appears edited on the canvas. The box
 * is the one the canvas lays the draft out in: a fixed-width box keeps its width and grows as tall
 * as the draft wraps to, an auto-width box is as wide as its longest line.
 * @param node - The text node being edited.
 * @param viewport - The current pan and zoom.
 * @param draftText - What has been typed so far.
 * @param measureTextBox - Sizes a text box: the shaped layout in the app, an estimate in tests.
 * @returns The box in CSS pixels, with the font size and rotation to match the canvas text.
 */
export const getTextOverlayLayout = (
  node: DesignNode,
  viewport: Viewport,
  draftText: string,
  measureTextBox: TextBoxMeasurer
): TextOverlayLayout => {
  const origin = worldToScreen(viewport, { x: node.x, y: node.y })
  const fitted = measureTextBox({
    text: draftText,
    fontFamily: node.fontFamily,
    fontWeight: node.fontWeight,
    fontStyle: node.fontStyle,
    letterSpacing: node.letterSpacing,
    fontSize: node.fontSize,
    lineHeight: node.lineHeight,
    textAlign: node.textAlign,
    wrapWidth: node.textWrap ? node.width : undefined,
    // The draft is not committed yet, so spans past its end are cut as committing will cut them.
    spans: clampTextSpans(node.spans, draftText.length),
    listStyle: node.listStyle,
    listIndent: node.listIndent
  })
  return {
    left: origin.x,
    top: origin.y,
    width: fitted.width * viewport.scale,
    height: fitted.height * viewport.scale,
    fontSize: node.fontSize * viewport.scale,
    fontWeight: node.fontWeight,
    fontStyle: node.fontStyle,
    letterSpacing: node.letterSpacing * node.fontSize * viewport.scale,
    lineHeight: node.fontSize * node.lineHeight * viewport.scale,
    textAlign: node.textAlign,
    isWrapping: node.textWrap,
    rotation: node.rotation,
    rotationOriginX: (node.width / 2) * viewport.scale,
    rotationOriginY: (node.height / 2) * viewport.scale
  }
}

/**
 * Builds the operations that end an in-place edit: one update with the new text, or a delete for
 * a new node left empty.
 * @param document - The document.
 * @param session - The node being edited.
 * @param draftText - The text in the editor.
 * @param measureTextBox - Sizes the box the committed text fills.
 * @returns The operations; none when nothing changed.
 */
export const createTextCommitOperations = (
  document: DesignDocument,
  session: TextEditSession,
  draftText: string,
  measureTextBox: TextBoxMeasurer
): DesignOperation[] => {
  const node = document.nodes[session.nodeId]
  if (!node) return []
  if (session.isNew && draftText.trim() === '') {
    return createDeleteOperations(document, [session.nodeId])
  }
  if (!session.isNew && draftText === node.text) return []
  return createPropertyOperations(document, session.nodeId, { text: draftText }, measureTextBox)
}
