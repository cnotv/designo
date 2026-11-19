import type { DesignNode } from '@designo/core'
import type { TextLayoutRequest } from './types.ts'

/**
 * Reads what a node's layout depends on. Only a fixed-width node wraps, so an auto-width node
 * shares its layout with every other of the same text, whatever its width.
 * @param node - The text node.
 * @returns The request.
 */
export const toTextLayoutRequest = (node: DesignNode): TextLayoutRequest => ({
  text: node.text,
  fontFamily: node.fontFamily,
  fontWeight: node.fontWeight,
  fontStyle: node.fontStyle,
  letterSpacing: node.letterSpacing,
  fontSize: node.fontSize,
  lineHeight: node.lineHeight,
  alignment: node.textAlign,
  wrapWidth: node.textWrap ? node.width : undefined
})
