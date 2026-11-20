import type { MigrationStep, RawDocument } from './types.ts'

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the page setup properties, keeping any it already has. A node it cannot read is
 * left for the schema to reject.
 * @param node - A raw node from a version 7 file.
 * @returns The node with the page setup set.
 */
export const addPageSetupToNode = (node: unknown): unknown =>
  isRawObject(node) ? { pageUnit: 'pt', bleed: 0, facing: 'single', guides: null, ...node } : node

/**
 * Version 7 to 8: nodes gained `pageUnit`, `bleed`, `facing` and `guides`. The values are those of
 * a page with no bleed and no guides, so a version 7 file looks and exports as it did.
 * @param raw - A raw version 7 document.
 * @returns The document with the properties added; the pipeline sets formatVersion.
 */
export const migratePageSetup: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addPageSetupToNode(node)])
    )
  }
}
