import type { MigrationStep, RawDocument } from './types.ts'

// These are version 3's defaults, written out rather than read from @designo/core: a migration
// describes one fixed step in the file's history, and must not change when a later default does.
const VERSION_THREE_TEXT_DEFAULTS: RawDocument = {
  textAlign: 'left',
  lineHeight: 1.2,
  textWrap: false
}

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the text properties it lacks, keeping any it already has. A node it cannot read
 * is left for the schema to reject.
 * @param node - A raw node from a version 2 file.
 * @returns The node with the three text properties set.
 */
export const addTextPropertiesToNode = (node: unknown): unknown =>
  isRawObject(node) ? { ...VERSION_THREE_TEXT_DEFAULTS, ...node } : node

/**
 * Version 2 to 3: text gained `textAlign`, `lineHeight` and `textWrap`. Every node carries every
 * property, so every node is given the defaults, which draw text as version 2 did: left aligned,
 * lines 1.2 times the font size apart, and not wrapped.
 * @param raw - A raw version 2 document.
 * @returns The document with the properties added; the pipeline sets formatVersion.
 */
export const migrateTextProperties: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addTextPropertiesToNode(node)])
    )
  }
}
