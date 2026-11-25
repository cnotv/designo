import type { MigrationStep, RawDocument } from './types.ts'

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the fit property, keeping one it already has. A node it cannot read is left for
 * the schema to reject.
 * @param node - A raw node from a version 9 file.
 * @returns The node with `imageFit` set.
 */
export const addImageFitToNode = (node: unknown): unknown =>
  isRawObject(node) ? { imageFit: 'stretch', ...node } : node

/**
 * Version 9 to 10: nodes gained `imageFit`. Pictures were always stretched, so every node gets
 * `stretch` and a version 9 file draws as it did.
 * @param raw - A raw version 9 document.
 * @returns The document with the property added; the pipeline sets formatVersion.
 */
export const migrateImageFit: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addImageFitToNode(node)])
    )
  }
}
