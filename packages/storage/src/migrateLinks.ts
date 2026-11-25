import type { MigrationStep, RawDocument } from './types.ts'

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the link property, keeping one it already has. A node it cannot read is left for
 * the schema to reject.
 * @param node - A raw node from a version 10 file.
 * @returns The node with `link` set.
 */
export const addLinkToNode = (node: unknown): unknown =>
  isRawObject(node) ? { link: null, ...node } : node

/**
 * Version 10 to 11: nodes gained `link`. No node had a link, so every node gets null and a
 * version 10 file exports as it did.
 * @param raw - A raw version 10 document.
 * @returns The document with the property added; the pipeline sets formatVersion.
 */
export const migrateLinks: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addLinkToNode(node)])
    )
  }
}
