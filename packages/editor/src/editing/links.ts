import { isValidLink, type DesignNodeType } from '@designo/core'

const LINKABLE_TYPES: readonly DesignNodeType[] = ['text', 'rectangle', 'frame']

/**
 * Whether the properties panel offers a link field for a node type.
 * @param type - The node's type.
 * @returns True for text, rectangles and frames, the nodes the PDF export makes clickable.
 */
export const canHaveLink = (type: DesignNodeType): boolean => LINKABLE_TYPES.includes(type)

/**
 * Reads what was typed into the link field.
 * @param raw - The field's text.
 * @returns The trimmed address, null when the field was emptied (no link), or undefined when
 * what was typed is not an `https:`, `mailto:` or `tel:` address, which leaves the link as it was.
 */
export const readLinkInput = (raw: string): string | null | undefined => {
  const link = raw.trim()
  if (link === '') return null
  return isValidLink(link) ? link : undefined
}
