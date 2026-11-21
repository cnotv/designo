import { DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import { getChildren, getSubtreeIds } from './document.ts'
import type { DesignDocument, DesignNode, DesignNodePatch } from './types.ts'

const COMPONENT_NODE_TYPES: readonly string[] = ['frame', 'group']

// An instance is placed and named by its owner, and a pdf page number belongs to one frame only.
const OWN_TO_INSTANCE_ROOT: readonly string[] = ['x', 'y', 'name']
const NEVER_MIRRORED: readonly string[] = ['pdfPage']
const NOT_MIRRORED: readonly string[] = [
  'id',
  'type',
  'parentId',
  'order',
  'isComponent',
  'sourceId',
  'overrides'
]

/**
 * Whether a node is a copy that belongs to an instance, the instance's own node included.
 * @param node - The node to look at.
 * @returns True when the node mirrors a component node.
 */
export const isInstanceNode = (node: DesignNode): boolean => node.sourceId !== undefined

/**
 * Whether a node is the top of an instance, as opposed to a copy inside one.
 * @param document - The document the node belongs to.
 * @param node - The node to look at.
 * @returns True when the node is an instance and its parent is not part of another one.
 */
export const isInstanceRoot = (document: DesignDocument, node: DesignNode): boolean => {
  const parent = node.parentId === null ? undefined : document.nodes[node.parentId]
  return isInstanceNode(node) && !(parent && isInstanceNode(parent))
}

const hasComponentAbove = (document: DesignDocument, nodeId: string): boolean => {
  const parentId = document.nodes[nodeId]?.parentId
  const parent = parentId ? document.nodes[parentId] : undefined
  return (
    parent !== undefined && (parent.isComponent === true || hasComponentAbove(document, parent.id))
  )
}

/**
 * Says why a node cannot become a component, or nothing when it can.
 * @param document - The document the node belongs to.
 * @param node - The node to make a component.
 * @returns The reason, or undefined.
 */
export const checkMakeComponent = (
  document: DesignDocument,
  node: DesignNode
): string | undefined => {
  if (!COMPONENT_NODE_TYPES.includes(node.type))
    return `Node ${node.id} is a ${node.type}; only a frame or group can be a component`
  const subtree = getSubtreeIds(document, node.id).flatMap((id) => document.nodes[id] ?? [])
  if (subtree.some((member) => isInstanceNode(member) || (member.isComponent && member !== node)))
    return `Node ${node.id} holds an instance or another component, so it cannot be a component`
  if (hasComponentAbove(document, node.id))
    return `Node ${node.id} is inside a component, so it cannot be one itself`
  return undefined
}

/**
 * Says why nothing may be placed under a parent as a new or moved node, or nothing when it can.
 * @param document - The document the parent belongs to.
 * @param parentId - The parent the node would go under.
 * @returns The reason, or undefined.
 */
export const checkNotInsideInstance = (
  document: DesignDocument,
  parentId: string
): string | undefined =>
  document.nodes[parentId]?.sourceId === undefined
    ? undefined
    : `Node ${parentId} is part of an instance; change the component, or detach the instance first`

/**
 * Says why a node may not be deleted or moved by itself, or nothing when it can.
 * @param document - The document the node belongs to.
 * @param node - The node to delete or move.
 * @returns The reason, or undefined.
 */
export const checkNotInstancePart = (
  document: DesignDocument,
  node: DesignNode
): string | undefined =>
  isInstanceNode(node) && !isInstanceRoot(document, node)
    ? `Node ${node.id} is part of an instance; change the component, or detach the instance first`
    : undefined

/**
 * Says why an instance cannot be placed, or nothing when it can.
 * @param document - The document the instance goes into.
 * @param componentId - The component to copy.
 * @param parentId - The parent the instance goes under.
 * @returns The reason, or undefined.
 */
export const checkCreateInstance = (
  document: DesignDocument,
  componentId: string,
  parentId: string
): string | undefined => {
  if (!document.nodes[componentId]?.isComponent) return `Node ${componentId} is not a component`
  const parent = document.nodes[parentId]
  if (!parent) return undefined
  if (parent.isComponent || hasComponentAbove(document, parentId))
    return `Node ${parentId} is inside a component, which cannot hold an instance`
  return checkNotInsideInstance(document, parentId)
}

/**
 * The nodes a new instance of a component starts from; the sync that follows fills the rest in.
 * @param component - The component to copy.
 * @param instance - Where the instance goes.
 * @returns The instance's own node.
 */
export const createInstanceNode = (
  component: DesignNode,
  instance: Pick<DesignNode, 'id' | 'parentId' | 'order' | 'x' | 'y'>
): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  ...instance,
  name: component.name,
  type: component.type,
  sourceId: component.id
})

interface Offset {
  x: number
  y: number
}

// Positions are absolute on the page, so what sits inside an instance is the component's
// position moved by however far the instance itself sits from the component.
const offsetOfInstance = (instance: DesignNode, component: DesignNode): Offset => ({
  x: instance.x - component.x,
  y: instance.y - component.y
})

const findInstanceRoot = (document: DesignDocument, node: DesignNode): DesignNode | undefined => {
  if (isInstanceRoot(document, node)) return node
  const parent = node.parentId === null ? undefined : document.nodes[node.parentId]
  return parent ? findInstanceRoot(document, parent) : undefined
}

const mirroredValue = (source: DesignNode, key: string, offset: Offset): unknown =>
  key === 'x' || key === 'y' ? source[key] + offset[key] : source[key as keyof DesignNode]

const offsetWithin = (document: DesignDocument, node: DesignNode): Offset => {
  const root = findInstanceRoot(document, node)
  const component = root?.sourceId ? document.nodes[root.sourceId] : undefined
  return root && component ? offsetOfInstance(root, component) : { x: 0, y: 0 }
}

// The box of a text that is not a fixed-width box follows its words, so it is never an override.
const isAutoSizedText = (node: DesignNode): boolean => node.type === 'text' && !node.textWrap

/**
 * Works out which properties an instance node keeps for itself after an edit: those that now differ
 * from the node it mirrors. A property set back to the component's value follows it again.
 * @param document - The document before the edit.
 * @param node - The instance node after the edit.
 * @param patch - The edit.
 * @returns The node with its overrides, or the node unchanged when the patch sets them itself.
 */
export const withOverridesAfterPatch = (
  document: DesignDocument,
  node: DesignNode,
  patch: DesignNodePatch
): DesignNode => {
  const source = node.sourceId ? document.nodes[node.sourceId] : undefined
  if (!source || 'overrides' in patch) return node
  const differing = Object.keys(patch).filter(
    (key) =>
      !NOT_MIRRORED.includes(key) &&
      !NEVER_MIRRORED.includes(key) &&
      !(isInstanceRoot(document, node) && OWN_TO_INSTANCE_ROOT.includes(key)) &&
      !(isAutoSizedText(node) && (key === 'width' || key === 'height')) &&
      JSON.stringify(node[key as keyof DesignNode]) !==
        JSON.stringify(mirroredValue(source, key, offsetWithin(document, node)))
  )
  const untouched = (node.overrides ?? []).filter((key) => !(key in patch))
  return { ...node, overrides: [...new Set([...untouched, ...differing])] }
}

const mirroredProperties = (
  source: DesignNode,
  existing: DesignNode,
  isRoot: boolean,
  offset: Offset
): Partial<DesignNode> => {
  const overridden = new Set(existing.overrides ?? [])
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [
        key,
        key === 'x' || key === 'y' ? mirroredValue(source, key, offset) : value
      ])
      .filter(
        ([key]) =>
          !NOT_MIRRORED.includes(key) &&
          !NEVER_MIRRORED.includes(key) &&
          !overridden.has(key) &&
          !(isRoot && OWN_TO_INSTANCE_ROOT.includes(key))
      )
  )
}

interface CopyChanges {
  set: DesignNode[]
  remove: string[]
}

const syncCopy = (
  document: DesignDocument,
  source: DesignNode,
  copy: DesignNode,
  where: { rootId: string; offset: Offset },
  isRoot: boolean
): CopyChanges => {
  const { rootId, offset } = where
  const synced: DesignNode = { ...copy, ...mirroredProperties(source, copy, isRoot, offset) }
  const copyChildren = getChildren(document, copy.id)
  const sourceChildren = getChildren(document, source.id)
  const sourceChildIds = new Set(sourceChildren.map((child) => child.id))
  const copiedByOrigin = new Map(copyChildren.map((child) => [child.sourceId, child]))
  const childChanges = sourceChildren.map((child) =>
    syncCopy(
      document,
      child,
      copiedByOrigin.get(child.id) ?? {
        ...DEFAULT_NODE_PROPERTIES,
        id: `${rootId}:${child.id}`,
        type: child.type,
        parentId: copy.id,
        order: child.order,
        sourceId: child.id
      },
      where,
      false
    )
  )
  return {
    set: [synced, ...childChanges.flatMap((changes) => changes.set)],
    remove: [
      ...copyChildren
        .filter((child) => child.sourceId !== undefined && !sourceChildIds.has(child.sourceId))
        .flatMap((orphan) => getSubtreeIds(document, orphan.id)),
      ...childChanges.flatMap((changes) => changes.remove)
    ]
  }
}

/**
 * Brings every instance up to date with its component: copied properties follow the component,
 * except the overridden ones, and children the component gained or lost are added or removed. An
 * instance whose component is gone is left as it is.
 * @param document - The document after an operation.
 * @returns The document with instances in step, or the same document when it has none.
 */
export const syncInstances = (document: DesignDocument): DesignDocument => {
  const instances = Object.values(document.nodes).filter(
    (node) =>
      isInstanceRoot(document, node) &&
      node.sourceId !== undefined &&
      document.nodes[node.sourceId]?.isComponent
  )
  if (instances.length === 0) return document
  const changes = instances.map((instance) => {
    const component = document.nodes[instance.sourceId ?? ''] as DesignNode
    return syncCopy(
      document,
      component,
      instance,
      { rootId: instance.id, offset: offsetOfInstance(instance, component) },
      true
    )
  })
  const removed = new Set(changes.flatMap((change) => change.remove))
  const nodes = Object.fromEntries(
    Object.entries({
      ...document.nodes,
      ...Object.fromEntries(changes.flatMap((change) => change.set).map((node) => [node.id, node]))
    }).filter(([id]) => !removed.has(id))
  )
  return { ...document, nodes }
}

/**
 * Lists a node and everything beneath it.
 * @param document - The document the node belongs to.
 * @param nodeId - The top of the subtree.
 * @returns The subtree's nodes.
 */
export const getSubtreeNodes = (document: DesignDocument, nodeId: string): DesignNode[] =>
  getSubtreeIds(document, nodeId).flatMap((id) => document.nodes[id] ?? [])
