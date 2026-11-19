import type { MigrationStep, RawDocument } from './types.ts'

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node `pdfPage`, keeping one it already has. A node it cannot read is left for the
 * schema to reject.
 * @param node - A raw node from a version 5 file.
 * @returns The node with `pdfPage` set.
 */
export const addFramePageToNode = (node: unknown): unknown =>
  isRawObject(node) ? { pdfPage: null, ...node } : node

/**
 * Version 5 to 6: nodes gained `pdfPage`. Null marks no frame as a PDF page, so a version 5 file
 * exports as it did, a page for each design page.
 * @param raw - A raw version 5 document.
 * @returns The document with the property added; the pipeline sets formatVersion.
 */
export const migrateFramePages: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addFramePageToNode(node)])
    )
  }
}
