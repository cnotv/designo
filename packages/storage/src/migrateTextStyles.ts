import type { MigrationStep, RawDocument } from './types.ts'

// Version 5's defaults, written out rather than read from @designo/core: a migration describes one
// fixed step in the file's history, and must not change when a later default does.
const VERSION_FIVE_TEXT_STYLE_DEFAULTS: RawDocument = {
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: 0
}

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the text style properties it lacks, keeping any it already has. A node it cannot
 * read is left for the schema to reject.
 * @param node - A raw node from a version 4 file.
 * @returns The node with the three text style properties set.
 */
export const addTextStylesToNode = (node: unknown): unknown =>
  isRawObject(node) ? { ...VERSION_FIVE_TEXT_STYLE_DEFAULTS, ...node } : node

/**
 * Version 4 to 5: text gained `fontWeight`, `fontStyle` and `letterSpacing`. The defaults draw text
 * as version 4 did: regular weight, upright and with the font's own spacing.
 * @param raw - A raw version 4 document.
 * @returns The document with the properties added; the pipeline sets formatVersion.
 */
export const migrateTextStyles: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addTextStylesToNode(node)])
    )
  }
}
