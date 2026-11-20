import type { MigrationStep, RawDocument } from './types.ts'

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const NO_AUTO_LAYOUT = {
  layoutMode: 'none',
  layoutGap: 0,
  layoutPadding: 0,
  layoutAlign: 'start',
  layoutCrossAlign: 'start',
  widthSizing: 'fixed',
  heightSizing: 'fixed'
}

/**
 * Gives one node the auto-layout properties, keeping any it already has. A node it cannot read is
 * left for the schema to reject.
 * @param node - A raw node from a version 6 file.
 * @returns The node with the properties set.
 */
export const addAutoLayoutToNode = (node: unknown): unknown =>
  isRawObject(node) ? { ...NO_AUTO_LAYOUT, ...node } : node

/**
 * Version 6 to 7: nodes gained auto-layout. Every frame starts with it off and every size fixed,
 * so a version 6 file lays out as it did.
 * @param raw - A raw version 6 document.
 * @returns The document with the property added; the pipeline sets formatVersion.
 */
export const migrateAutoLayout: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addAutoLayoutToNode(node)])
    )
  }
}
