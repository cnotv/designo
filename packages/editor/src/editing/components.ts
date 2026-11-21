import { isInstanceRoot, type DesignDocument, type DesignOperation } from '@designo/core'
import type { SelectionChange } from './types.ts'

const NO_CHANGE: SelectionChange = { operations: [], selection: [] }

// A new instance sits beside its component, not on top of it.
const INSTANCE_OFFSET = 24

const onlySelected = (document: DesignDocument, nodeIds: readonly string[]) =>
  nodeIds.length === 1 ? document.nodes[nodeIds[0] ?? ''] : undefined

/**
 * Makes the selected frame or group a component.
 * @param document - The document.
 * @param nodeIds - The selection; one node.
 * @returns The operation, or nothing when the node cannot be a component.
 */
export const createMakeComponentOperations = (
  document: DesignDocument,
  nodeIds: readonly string[]
): SelectionChange => {
  const node = onlySelected(document, nodeIds)
  if (!node || node.isComponent) return NO_CHANGE
  return {
    operations: [{ kind: 'update', id: node.id, patch: { isComponent: true } }],
    selection: [...nodeIds]
  }
}

/**
 * Places an instance of the selected component beside it and selects the instance.
 * @param document - The document.
 * @param nodeIds - The selection; one component.
 * @param instanceId - The id for the new instance.
 * @returns The operation and the instance as the new selection; nothing unless a component is selected.
 */
export const createInstanceOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  instanceId: string
): SelectionChange => {
  const component = onlySelected(document, nodeIds)
  if (!component?.isComponent || !component.parentId) return NO_CHANGE
  const operation: DesignOperation = {
    kind: 'createInstance',
    id: instanceId,
    componentId: component.id,
    parentId: component.parentId,
    x: component.x + component.width + INSTANCE_OFFSET,
    y: component.y
  }
  return { operations: [operation], selection: [instanceId] }
}

/**
 * Turns the selected instances into plain nodes.
 * @param document - The document.
 * @param nodeIds - The selection.
 * @returns One operation per selected instance; nothing for the rest.
 */
export const createDetachOperations = (
  document: DesignDocument,
  nodeIds: readonly string[]
): SelectionChange => ({
  operations: nodeIds.flatMap((id): DesignOperation[] => {
    const node = document.nodes[id]
    return node && isInstanceRoot(document, node) ? [{ kind: 'detachInstance', id }] : []
  }),
  selection: [...nodeIds]
})

/**
 * Makes the selected instance nodes follow their component again.
 * @param document - The document.
 * @param nodeIds - The selection.
 * @returns One operation per selected node that belongs to an instance and has overrides.
 */
export const createResetOverridesOperations = (
  document: DesignDocument,
  nodeIds: readonly string[]
): SelectionChange => ({
  operations: nodeIds.flatMap((id): DesignOperation[] =>
    document.nodes[id]?.sourceId === undefined ? [] : [{ kind: 'resetOverrides', id }]
  ),
  selection: [...nodeIds]
})
