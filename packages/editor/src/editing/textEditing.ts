import type { DesignDocument, DesignNode, DesignOperation } from '@designo/core'
import { estimateTextSize, TEXT_LINE_HEIGHT } from './geometry.ts'
import { createDeleteOperations, createPropertyOperations } from './operations.ts'
import type { TextEditSession, TextOverlayLayout, Viewport } from './types.ts'
import { worldToScreen } from './viewport.ts'

/**
 * Works out where the text editor overlay goes so the text appears edited on the canvas. The box
 * grows with the draft, as the committed node is resized to fit it.
 * @param node - The text node being edited.
 * @param viewport - The current pan and zoom.
 * @param draftText - What has been typed so far.
 * @returns The box in CSS pixels, with the font size and rotation to match the canvas text.
 */
export const getTextOverlayLayout = (
  node: DesignNode,
  viewport: Viewport,
  draftText: string
): TextOverlayLayout => {
  const origin = worldToScreen(viewport, { x: node.x, y: node.y })
  const fitted = estimateTextSize(draftText, node.fontSize)
  return {
    left: origin.x,
    top: origin.y,
    width: Math.max(node.width, fitted.width) * viewport.scale,
    height: fitted.height * viewport.scale,
    fontSize: node.fontSize * viewport.scale,
    lineHeight: node.fontSize * TEXT_LINE_HEIGHT * viewport.scale,
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
 * @returns The operations; none when nothing changed.
 */
export const createTextCommitOperations = (
  document: DesignDocument,
  session: TextEditSession,
  draftText: string
): DesignOperation[] => {
  const node = document.nodes[session.nodeId]
  if (!node) return []
  if (session.isNew && draftText.trim() === '') {
    return createDeleteOperations(document, [session.nodeId])
  }
  if (!session.isNew && draftText === node.text) return []
  return createPropertyOperations(document, session.nodeId, { text: draftText })
}
