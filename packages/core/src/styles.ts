import {
  COLOR_BINDABLE_PROPERTIES,
  HEX_COLOR_PATTERN,
  NUMBER_BINDABLE_RANGES,
  TEXT_STYLE_PROPERTIES
} from './defaults.ts'
import type {
  DesignDocument,
  DesignNode,
  DesignNodePatch,
  DesignNodeStyleLinks,
  DesignOperation,
  DesignVariable,
  OperationResult,
  StyleOperation,
  TextStyle
} from './types.ts'

/** The keys of a node that tie it to a variable or a text style. */
export const STYLE_LINK_KEYS = ['bindings', 'textStyleId', 'styleOverrides'] as const

type NumberRange = { min: number; max: number }

const numberRangeOf = (property: string): NumberRange | undefined =>
  (NUMBER_BINDABLE_RANGES as Readonly<Record<string, NumberRange>>)[property]

const checkInRange = (label: string, property: string, value: unknown): string | undefined => {
  const range = numberRangeOf(property)
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} needs a number`
  if (range && (value < range.min || value > range.max)) {
    return `${label} needs a ${property} from ${range.min} to ${range.max}`
  }
  return undefined
}

const checkVariable = (variable: DesignVariable): string | undefined => {
  if (variable.kind === 'color') {
    return typeof variable.value === 'string' && HEX_COLOR_PATTERN.test(variable.value)
      ? undefined
      : `Variable ${variable.id} needs a hex colour: #rrggbb or #rrggbbaa`
  }
  return typeof variable.value === 'number' && Number.isFinite(variable.value)
    ? undefined
    : `Variable ${variable.id} needs a number`
}

const checkTextStyle = (style: TextStyle): string | undefined =>
  (['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const)
    .map((property) => checkInRange(`Text style ${style.id}`, property, style[property]))
    .find((problem) => problem !== undefined)

const checkBinding = (
  document: DesignDocument,
  node: DesignNode,
  [property, variableId]: readonly [string, string]
): string | undefined => {
  const variable = document.variables?.[variableId]
  if (!variable)
    return `Node ${node.id} binds ${property} to variable ${variableId}, which does not exist`
  const bindable =
    variable.kind === 'color'
      ? (COLOR_BINDABLE_PROPERTIES as readonly string[]).includes(property)
      : numberRangeOf(property) !== undefined
  if (!bindable) {
    return `Node ${node.id} cannot bind ${property} to the ${variable.kind} variable ${variableId}`
  }
  return variable.kind === 'number'
    ? checkInRange(`Node ${node.id}, bound to variable ${variableId},`, property, variable.value)
    : undefined
}

const checkNodeLinks = (document: DesignDocument, node: DesignNode): string | undefined => {
  const bindingProblem = Object.entries(node.bindings ?? {})
    .map((binding) => checkBinding(document, node, binding))
    .find((problem) => problem !== undefined)
  if (bindingProblem) return bindingProblem
  if (!node.textStyleId) return undefined
  if (node.type !== 'text')
    return `Node ${node.id} is a ${node.type}; only a text can have a text style`
  return document.textStyles?.[node.textStyleId]
    ? undefined
    : `Node ${node.id} uses text style ${node.textStyleId}, which does not exist`
}

const hasStyleLinks = (node: DesignNode): boolean =>
  Object.keys(node.bindings ?? {}).length > 0 || Boolean(node.textStyleId)

const resolvedProperties = (document: DesignDocument, node: DesignNode): Partial<DesignNode> => {
  const instanceOverrides = new Set(node.overrides ?? [])
  const styleOverrides = new Set(node.styleOverrides ?? [])
  const style = node.textStyleId ? document.textStyles?.[node.textStyleId] : undefined
  const fromStyle = style
    ? TEXT_STYLE_PROPERTIES.filter(
        (property) => !instanceOverrides.has(property) && !styleOverrides.has(property)
      ).map((property) => [property, style[property]] as const)
    : []
  const fromVariables = Object.entries(node.bindings ?? {})
    .filter(([property]) => !instanceOverrides.has(property))
    .map(([property, variableId]) => [property, document.variables?.[variableId]?.value] as const)
  // A binding is the more specific choice, so it wins over the text style.
  return Object.fromEntries([...fromStyle, ...fromVariables])
}

const isChanged = (node: DesignNode, resolved: Partial<DesignNode>): boolean =>
  Object.entries(resolved).some(([property, value]) => node[property as keyof DesignNode] !== value)

/**
 * Checks every variable and text style link in a document and writes what they resolve to into the
 * nodes, so a change to a variable or a style reaches every node that uses it. Each exporter and the
 * editor read the resolved properties and need no knowledge of the links.
 * @param document - The document after an operation.
 * @returns The document with every linked property resolved, or the first broken link.
 */
export const resolveStyles = (document: DesignDocument): OperationResult => {
  const linked = Object.values(document.nodes).filter(hasStyleLinks)
  if (linked.length === 0) return { ok: true, document }
  const problem = linked
    .map((node) => checkNodeLinks(document, node))
    .find((found) => found !== undefined)
  if (problem) return { ok: false, error: problem }
  const changed = linked.flatMap((node) => {
    const resolved = resolvedProperties(document, node)
    return isChanged(node, resolved) ? [{ ...node, ...resolved }] : []
  })
  return changed.length === 0
    ? { ok: true, document }
    : {
        ok: true,
        document: {
          ...document,
          nodes: {
            ...document.nodes,
            ...Object.fromEntries(changed.map((node) => [node.id, node]))
          }
        }
      }
}

const withoutLinkKeys = (node: DesignNode, keys: readonly string[]): DesignNode =>
  Object.fromEntries(
    Object.entries(node).filter(([key]) => !keys.includes(key))
  ) as unknown as DesignNode

const nonEmpty = <Value>(value: readonly Value[] | undefined): readonly Value[] | undefined =>
  value && value.length > 0 ? value : undefined

const bindingsAfterPatch = (
  previous: DesignNode | undefined,
  patch: DesignNodePatch
): DesignNodeStyleLinks['bindings'] => {
  if ('bindings' in patch) return patch.bindings
  // Setting a bound property by hand ends its binding; the value set stays.
  return Object.fromEntries(
    Object.entries(previous?.bindings ?? {}).filter(([property]) => !(property in patch))
  )
}

const styleOverridesAfterPatch = (
  node: DesignNode,
  previous: DesignNode | undefined,
  patch: DesignNodePatch
): readonly string[] | undefined => {
  if ('styleOverrides' in patch) return patch.styleOverrides
  const changedStyle =
    patch.textStyleId !== undefined && patch.textStyleId !== previous?.textStyleId
  const kept = changedStyle ? [] : (previous?.styleOverrides ?? [])
  const edited = TEXT_STYLE_PROPERTIES.filter((property) => property in patch)
  return node.textStyleId ? [...new Set([...kept, ...edited])] : undefined
}

/**
 * Brings a node's variable and text style links in step with an edit: a property set by hand is no
 * longer bound, and a style property set by hand is kept as an override of the text style.
 * @param node - The node after the patch was merged in.
 * @param previous - The node before the edit, or undefined for a node being created.
 * @param patch - The edit, or the properties of the new node.
 * @returns The node with its links, and none of the keys left empty.
 */
export const withStyleLinksAfterPatch = (
  node: DesignNode,
  previous: DesignNode | undefined,
  patch: DesignNodePatch
): DesignNode => {
  const touched = STYLE_LINK_KEYS.some((key) => key in patch) || hasStyleLinks(node)
  if (!touched) return node
  const bindings = bindingsAfterPatch(previous, patch)
  const textStyleId = node.textStyleId || undefined
  const styleOverrides = nonEmpty(styleOverridesAfterPatch(node, previous, patch))
  const plain = withoutLinkKeys(node, STYLE_LINK_KEYS)
  return {
    ...plain,
    ...(bindings && Object.keys(bindings).length > 0 ? { bindings } : {}),
    ...(textStyleId ? { textStyleId } : {}),
    ...(textStyleId && styleOverrides ? { styleOverrides } : {})
  }
}

const withoutRecordKey = <Value>(
  record: Readonly<Record<string, Value>> | undefined,
  key: string
): Readonly<Record<string, Value>> | undefined => {
  const kept = Object.fromEntries(Object.entries(record ?? {}).filter(([id]) => id !== key))
  return Object.keys(kept).length > 0 ? kept : undefined
}

const withDocumentRecords = (
  document: DesignDocument,
  records: Pick<DesignDocument, 'variables' | 'textStyles'>
): DesignDocument => {
  const { variables: _variables, textStyles: _textStyles, ...rest } = document
  return {
    ...rest,
    ...(records.variables ? { variables: records.variables } : {}),
    ...(records.textStyles ? { textStyles: records.textStyles } : {})
  }
}

const withNodeEdits = (
  document: DesignDocument,
  edit: (node: DesignNode) => DesignNode
): DesignDocument => ({
  ...document,
  nodes: Object.fromEntries(Object.entries(document.nodes).map(([id, node]) => [id, edit(node)]))
})

const applySetVariable = (document: DesignDocument, variable: DesignVariable): OperationResult => {
  const problem = checkVariable(variable)
  if (problem) return { ok: false, error: problem }
  return {
    ok: true,
    document: withDocumentRecords(document, {
      variables: { ...document.variables, [variable.id]: variable },
      textStyles: document.textStyles
    })
  }
}

const applyDeleteVariable = (document: DesignDocument, id: string): OperationResult => {
  if (!document.variables?.[id]) return { ok: false, error: `Variable ${id} does not exist` }
  const unbound = withNodeEdits(document, (node) => {
    const all = Object.entries(node.bindings ?? {})
    const kept = Object.fromEntries(all.filter(([, variableId]) => variableId !== id))
    return Object.keys(kept).length === all.length
      ? node
      : withStyleLinksAfterPatch({ ...node, bindings: kept }, node, { bindings: kept })
  })
  return {
    ok: true,
    document: withDocumentRecords(unbound, {
      variables: withoutRecordKey(document.variables, id),
      textStyles: document.textStyles
    })
  }
}

const applySetTextStyle = (document: DesignDocument, style: TextStyle): OperationResult => {
  const problem = checkTextStyle(style)
  if (problem) return { ok: false, error: problem }
  return {
    ok: true,
    document: withDocumentRecords(document, {
      variables: document.variables,
      textStyles: { ...document.textStyles, [style.id]: style }
    })
  }
}

const applyDeleteTextStyle = (document: DesignDocument, id: string): OperationResult => {
  if (!document.textStyles?.[id]) return { ok: false, error: `Text style ${id} does not exist` }
  const unlinked = withNodeEdits(document, (node) =>
    node.textStyleId === id ? withoutLinkKeys(node, ['textStyleId', 'styleOverrides']) : node
  )
  return {
    ok: true,
    document: withDocumentRecords(unlinked, {
      variables: document.variables,
      textStyles: withoutRecordKey(document.textStyles, id)
    })
  }
}

/**
 * Whether an operation changes the document's variables or text styles.
 * @param operation - Any operation.
 * @returns True for setVariable, deleteVariable, setTextStyle and deleteTextStyle.
 */
export const isStyleOperation = (operation: DesignOperation): operation is StyleOperation =>
  operation.kind === 'setVariable' ||
  operation.kind === 'deleteVariable' ||
  operation.kind === 'setTextStyle' ||
  operation.kind === 'deleteTextStyle'

/**
 * Applies an operation on variables or text styles; the links are resolved after it.
 * @param document - The document before the operation.
 * @param operation - A style operation.
 * @returns The new document, or the reason the operation was refused.
 */
export const applyStyleOperation = (
  document: DesignDocument,
  operation: StyleOperation
): OperationResult => {
  if (operation.kind === 'setVariable') return applySetVariable(document, operation.variable)
  if (operation.kind === 'deleteVariable') return applyDeleteVariable(document, operation.id)
  if (operation.kind === 'setTextStyle') return applySetTextStyle(document, operation.style)
  return applyDeleteTextStyle(document, operation.id)
}

const invertVariableOperation = (
  document: DesignDocument,
  operation: Extract<StyleOperation, { kind: 'setVariable' | 'deleteVariable' }>
): DesignOperation[] => {
  const id = operation.kind === 'setVariable' ? operation.variable.id : operation.id
  const existing = document.variables?.[id]
  if (operation.kind === 'setVariable') {
    return [existing ? { kind: 'setVariable', variable: existing } : { kind: 'deleteVariable', id }]
  }
  if (!existing) return []
  return [
    { kind: 'setVariable', variable: existing },
    ...Object.values(document.nodes)
      .filter(
        (node) => node.sourceId === undefined && Object.values(node.bindings ?? {}).includes(id)
      )
      .map((node) => ({ kind: 'update' as const, id: node.id, patch: { bindings: node.bindings } }))
  ]
}

const invertTextStyleOperation = (
  document: DesignDocument,
  operation: Extract<StyleOperation, { kind: 'setTextStyle' | 'deleteTextStyle' }>
): DesignOperation[] => {
  const id = operation.kind === 'setTextStyle' ? operation.style.id : operation.id
  const existing = document.textStyles?.[id]
  if (operation.kind === 'setTextStyle') {
    return [existing ? { kind: 'setTextStyle', style: existing } : { kind: 'deleteTextStyle', id }]
  }
  if (!existing) return []
  return [
    { kind: 'setTextStyle', style: existing },
    ...Object.values(document.nodes)
      .filter((node) => node.sourceId === undefined && node.textStyleId === id)
      .map((node) => ({
        kind: 'update' as const,
        id: node.id,
        patch: { textStyleId: node.textStyleId, styleOverrides: node.styleOverrides }
      }))
  ]
}

/**
 * Works out the operations that undo a variable or text style operation. Copies that belong to an
 * instance are left out, because they take their links from the component again.
 * @param document - The document before the operation.
 * @param operation - A style operation.
 * @returns The operations that restore the variable or style, and the links to it that were cut.
 */
export const invertStyleOperation = (
  document: DesignDocument,
  operation: StyleOperation
): DesignOperation[] =>
  operation.kind === 'setVariable' || operation.kind === 'deleteVariable'
    ? invertVariableOperation(document, operation)
    : invertTextStyleOperation(document, operation)
