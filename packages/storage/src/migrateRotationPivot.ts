import type { MigrationStep, RawDocument } from './types.ts'

// Rounding keeps sub-micro noise from cos and sin out of the file; a design never needs it.
const roundCoordinate = (value: number): number => Math.round(value * 1e6) / 1e6

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Moves one rotated node so that turning it around its centre draws it where turning it around
 * its top-left corner used to. A node it cannot read is left for the schema to reject.
 * @param node - A raw node from a version 1 file.
 * @returns The node with its position adjusted, or unchanged.
 */
export const moveNodeToCentrePivot = (node: unknown): unknown => {
  if (!isRawObject(node)) return node
  const { x, y, width, height, rotation } = node
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    !isFiniteNumber(rotation) ||
    rotation % 360 === 0
  ) {
    return node
  }
  const radians = (rotation * Math.PI) / 180
  const halfWidth = width / 2
  const halfHeight = height / 2
  return {
    ...node,
    x: roundCoordinate(x + halfWidth * (Math.cos(radians) - 1) - halfHeight * Math.sin(radians)),
    y: roundCoordinate(y + halfWidth * Math.sin(radians) + halfHeight * (Math.cos(radians) - 1))
  }
}

/**
 * Version 1 to 2: version 1 turned a node around its top-left corner, version 2 turns it around
 * its centre, so every rotated node moves to keep being drawn in the same place.
 * @param raw - A raw version 1 document.
 * @returns The document with rotated nodes moved; the pipeline sets formatVersion.
 */
export const migrateRotationPivot: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, moveNodeToCentrePivot(node)])
    )
  }
}
