import type { MigrationStep, RawDocument } from './types.ts'

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the picture property, keeping one it already has. A node it cannot read is left
 * for the schema to reject.
 * @param node - A raw node from a version 8 file.
 * @returns The node with `imageAsset` set.
 */
export const addImageAssetToNode = (node: unknown): unknown =>
  isRawObject(node) ? { imageAsset: null, ...node } : node

/**
 * Version 8 to 9: nodes gained `imageAsset`, for the new image node. Every existing node has no
 * picture, so a version 8 file draws as it did.
 * @param raw - A raw version 8 document.
 * @returns The document with the property added; the pipeline sets formatVersion.
 */
export const migrateImages: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addImageAssetToNode(node)])
    )
  }
}
