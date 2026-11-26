import {
  HEX_COLOR_PATTERN,
  TEXT_STYLE_PROPERTIES,
  type DesignDocument,
  type DesignOperation,
  type DesignVariable,
  type TextStyle
} from '@designo/core'

/** The select value that stands for no variable or no text style. */
export const NO_STYLE = '__none__'

const DEFAULT_COLOR_VARIABLE_VALUE = '#000000'
const DEFAULT_NUMBER_VARIABLE_VALUE = 16

const byName = <Item extends { name: string }>(items: readonly Item[]): Item[] =>
  [...items].sort((first, second) => first.name.localeCompare(second.name))

/**
 * The document's variables in name order.
 * @param document - The document.
 * @returns The variables.
 */
export const listVariables = (document: DesignDocument): DesignVariable[] =>
  byName(Object.values(document.variables ?? {}))

/**
 * The document's text styles in name order.
 * @param document - The document.
 * @returns The text styles.
 */
export const listTextStyles = (document: DesignDocument): TextStyle[] =>
  byName(Object.values(document.textStyles ?? {}))

// The first "Label N" that no style of the same kind already uses, so a deleted one is reused.
const firstFreeName = (label: string, taken: readonly string[]): string => {
  const counter = (attempt: number): string =>
    taken.includes(`${label} ${attempt}`) ? counter(attempt + 1) : `${label} ${attempt}`
  return counter(1)
}

/**
 * Adds a variable with a starting value and a name that is free.
 * @param document - The document.
 * @param kind - A colour or a number.
 * @param id - The new variable's id.
 * @returns The operation.
 */
export const createNewVariableOperations = (
  document: DesignDocument,
  kind: DesignVariable['kind'],
  id: string
): DesignOperation[] => {
  const isColor = kind === 'color'
  const name = firstFreeName(
    isColor ? 'Colour' : 'Number',
    listVariables(document)
      .filter((variable) => variable.kind === kind)
      .map((variable) => variable.name)
  )
  const value = isColor ? DEFAULT_COLOR_VARIABLE_VALUE : DEFAULT_NUMBER_VARIABLE_VALUE
  return [{ kind: 'setVariable', variable: { id, name, kind, value } }]
}

/**
 * Makes a text style from the type settings of a text node.
 * @param document - The document.
 * @param nodeId - The text node to copy the settings from.
 * @param id - The new style's id.
 * @returns The operation; none when the node is not a text.
 */
export const createNewTextStyleOperations = (
  document: DesignDocument,
  nodeId: string,
  id: string
): DesignOperation[] => {
  const node = document.nodes[nodeId]
  if (node?.type !== 'text') return []
  const settings = Object.fromEntries(
    TEXT_STYLE_PROPERTIES.map((property) => [property, node[property]])
  ) as Pick<TextStyle, (typeof TEXT_STYLE_PROPERTIES)[number]>
  const name = firstFreeName(
    'Text style',
    listTextStyles(document).map((style) => style.name)
  )
  return [{ kind: 'setTextStyle', style: { id, name, ...settings } }]
}

/**
 * Renames a variable or a text style.
 * @param document - The document.
 * @param target - Which kind of item to rename.
 * @param id - The item's id.
 * @param name - The typed name.
 * @returns The operation; none when the name is empty, unchanged or the item is gone.
 */
export const createRenameStyleOperations = (
  document: DesignDocument,
  target: 'variable' | 'textStyle',
  id: string,
  name: string
): DesignOperation[] => {
  const trimmed = name.trim()
  if (target === 'variable') {
    const variable = document.variables?.[id]
    return !variable || trimmed === '' || trimmed === variable.name
      ? []
      : [{ kind: 'setVariable', variable: { ...variable, name: trimmed } }]
  }
  const style = document.textStyles?.[id]
  return !style || trimmed === '' || trimmed === style.name
    ? []
    : [{ kind: 'setTextStyle', style: { ...style, name: trimmed } }]
}

const parseVariableValue = (
  variable: DesignVariable,
  typed: string
): DesignVariable['value'] | undefined => {
  const trimmed = typed.trim()
  if (variable.kind === 'number') {
    const parsed = Number(trimmed)
    return trimmed !== '' && Number.isFinite(parsed) ? parsed : undefined
  }
  const color = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return HEX_COLOR_PATTERN.test(color) ? color.toLowerCase() : undefined
}

/**
 * Changes a variable's value; every node bound to it follows.
 * @param document - The document.
 * @param id - The variable's id.
 * @param typed - The typed value: a hex colour or a number.
 * @returns The operation; none when the value does not parse.
 */
export const createSetVariableValueOperations = (
  document: DesignDocument,
  id: string,
  typed: string
): DesignOperation[] => {
  const variable = document.variables?.[id]
  const value = variable ? parseVariableValue(variable, typed) : undefined
  return variable && value !== undefined
    ? [{ kind: 'setVariable', variable: { ...variable, value } }]
    : []
}

/**
 * Binds a node property to a variable, or detaches it (the value stays).
 * @param document - The document.
 * @param nodeId - The node.
 * @param property - The property, such as `fill`.
 * @param variableId - The variable to bind, or undefined to detach.
 * @returns The update.
 */
export const createBindVariableOperations = (
  document: DesignDocument,
  nodeId: string,
  property: string,
  variableId: string | undefined
): DesignOperation[] => {
  const kept = Object.fromEntries(
    Object.entries(document.nodes[nodeId]?.bindings ?? {}).filter(([key]) => key !== property)
  )
  const bindings = variableId ? { ...kept, [property]: variableId } : kept
  return [{ kind: 'update', id: nodeId, patch: { bindings } }]
}

/**
 * Applies a text style to a text node, or detaches it (the settings stay).
 * @param nodeId - The text node.
 * @param styleId - The style, or undefined to detach.
 * @returns The update.
 */
export const createApplyTextStyleOperations = (
  nodeId: string,
  styleId: string | undefined
): DesignOperation[] => [{ kind: 'update', id: nodeId, patch: { textStyleId: styleId ?? null } }]
