import type { MigrationStep, RawDocument } from './types.ts'

// Version 4's defaults, written out rather than read from @designo/core: a migration describes one
// fixed step in the file's history, and must not change when a later default does.
const VERSION_FOUR_EFFECT_DEFAULTS: RawDocument = {
  gradient: null,
  blur: 0,
  blendMode: 'normal',
  shadow: null
}

const isRawObject = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Gives one node the effect properties it lacks, keeping any it already has. A node it cannot
 * read is left for the schema to reject.
 * @param node - A raw node from a version 3 file.
 * @returns The node with the four effect properties set.
 */
export const addEffectsToNode = (node: unknown): unknown =>
  isRawObject(node) ? { ...VERSION_FOUR_EFFECT_DEFAULTS, ...node } : node

/**
 * Version 3 to 4: nodes gained `gradient`, `blur`, `blendMode` and `shadow`. The defaults draw a
 * node as version 3 did: a solid fill, sharp, normal blending and no shadow.
 * @param raw - A raw version 3 document.
 * @returns The document with the properties added; the pipeline sets formatVersion.
 */
export const migrateEffects: MigrationStep = (raw) => {
  const { nodes } = raw
  if (!isRawObject(nodes)) return raw
  return {
    ...raw,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([nodeId, node]) => [nodeId, addEffectsToNode(node)])
    )
  }
}
