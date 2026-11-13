import {
  getChildren,
  type DesignDocument,
  type DesignNode,
  type DesignOperation
} from '@designo/core'
import { getNodeBounds, unionBounds } from './geometry.ts'
import { getTopmostIds } from './selection.ts'
import type { SelectionChange } from './types.ts'

const NO_CHANGE: SelectionChange = { operations: [], selection: [] }

const selectedNodes = (document: DesignDocument, nodeIds: readonly string[]): DesignNode[] =>
  getTopmostIds(document, nodeIds)
    .map((nodeId) => document.nodes[nodeId])
    .filter((node): node is DesignNode => node !== undefined && node.type !== 'page')

/**
 * Builds the wrapping of selected siblings in a group the size of their bounds. The group takes
 * the lowest stacking position among them, and they keep their order inside it.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @param groupId - The id for the new group.
 * @returns The operations and the group as the new selection; nothing unless they share a parent.
 */
export const createGroupOperations = (
  document: DesignDocument,
  nodeIds: readonly string[],
  groupId: string
): SelectionChange => {
  const members = selectedNodes(document, nodeIds)
  const parentId = members[0]?.parentId
  if (!parentId || members.some((member) => member.parentId !== parentId)) return NO_CHANGE
  const bounds = unionBounds(members.map(getNodeBounds))
  if (!bounds) return NO_CHANGE
  const create: DesignOperation = {
    kind: 'create',
    id: groupId,
    type: 'group',
    parentId,
    order: Math.min(...members.map((member) => member.order)),
    properties: { name: 'Group', ...bounds }
  }
  const moves = members.map<DesignOperation>((member) => ({
    kind: 'move',
    id: member.id,
    parentId: groupId,
    order: member.order
  }))
  return { operations: [create, ...moves], selection: [groupId] }
}

// The group's children share the gap its slot leaves, so everything stays where it was drawn.
const ungroupOne = (document: DesignDocument, group: DesignNode): SelectionChange => {
  const parentId = group.parentId
  if (!parentId) return NO_CHANGE
  const children = getChildren(document, group.id)
  const nextSibling = getChildren(document, parentId).find((sibling) => sibling.order > group.order)
  const upperBound = nextSibling?.order ?? group.order + 1
  const step = (upperBound - group.order) / (children.length + 1)
  const moves = children.map<DesignOperation>((child, position) => ({
    kind: 'move',
    id: child.id,
    parentId,
    order: group.order + step * (position + 1)
  }))
  return {
    operations: [...moves, { kind: 'delete', id: group.id }],
    selection: children.map((child) => child.id)
  }
}

/**
 * Builds the dissolving of selected groups: their children move up to the group's parent at the
 * group's place in the stack, then the empty group is deleted.
 * @param document - The document.
 * @param nodeIds - The selected nodes.
 * @returns The operations and the freed children as the new selection; nothing when no group is
 * selected.
 */
export const createUngroupOperations = (
  document: DesignDocument,
  nodeIds: readonly string[]
): SelectionChange =>
  selectedNodes(document, nodeIds)
    .filter((node) => node.type === 'group')
    .map((group) => ungroupOne(document, group))
    .reduce<SelectionChange>(
      (all, change) => ({
        operations: [...all.operations, ...change.operations],
        selection: [...all.selection, ...change.selection]
      }),
      NO_CHANGE
    )
