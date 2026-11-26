import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignOperation,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  createApplyTextStyleOperations,
  createBindVariableOperations,
  createNewTextStyleOperations,
  createNewVariableOperations,
  createRenameStyleOperations,
  createSetVariableValueOperations,
  listTextStyles,
  listVariables
} from './styleLibrary.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const run = (document: DesignDocument, operations: readonly DesignOperation[]): DesignDocument =>
  unwrap(applyOperations(document, operations))

const base = run(createDocument('file', 'File', 'page'), [
  {
    kind: 'create',
    id: 'label',
    type: 'text',
    parentId: 'page',
    properties: { text: 'Hello', fill: '#111111', fontSize: 12 }
  },
  {
    kind: 'create',
    id: 'box',
    type: 'rectangle',
    parentId: 'page',
    properties: { fill: '#222222' }
  }
])

describe('creating variables and text styles', () => {
  it('adds a colour variable with a name that does not clash', () => {
    const first = run(base, createNewVariableOperations(base, 'color', 'v1'))
    const second = run(first, createNewVariableOperations(first, 'color', 'v2'))
    expect(listVariables(second).map((variable) => variable.name)).toEqual(['Colour 1', 'Colour 2'])
    expect(first.variables?.v1?.kind).toBe('color')
  })

  it('adds a number variable', () => {
    const next = run(base, createNewVariableOperations(base, 'number', 'n1'))
    expect(next.variables?.n1).toMatchObject({ kind: 'number', name: 'Number 1' })
  })

  it('makes a text style from the type settings of a text node', () => {
    const operations = createNewTextStyleOperations(base, 'label', 's1')
    const next = run(base, operations)
    expect(next.textStyles?.s1).toMatchObject({ name: 'Text style 1', fontSize: 12 })
  })

  it('makes no text style from a node that is not text', () => {
    expect(createNewTextStyleOperations(base, 'box', 's1')).toEqual([])
  })
})

describe('editing', () => {
  const withVariable = run(base, [
    { kind: 'setVariable', variable: { id: 'ink', name: 'Ink', kind: 'color', value: '#000000' } }
  ])

  it('renames a variable and a text style', () => {
    const renamed = run(
      withVariable,
      createRenameStyleOperations(withVariable, 'variable', 'ink', ' Paper ')
    )
    expect(renamed.variables?.ink?.name).toBe('Paper')
  })

  it('ignores an empty or unchanged name', () => {
    expect(createRenameStyleOperations(withVariable, 'variable', 'ink', '  ')).toEqual([])
    expect(createRenameStyleOperations(withVariable, 'variable', 'ink', 'Ink')).toEqual([])
  })

  it('changes a variable value, which reaches every bound node', () => {
    const bound = run(
      withVariable,
      ['label', 'box'].flatMap((id) =>
        createBindVariableOperations(withVariable, id, 'fill', 'ink')
      )
    )
    const changed = run(bound, createSetVariableValueOperations(bound, 'ink', '#ff0000'))
    expect(changed.nodes.label?.fill).toBe('#ff0000')
    expect(changed.nodes.box?.fill).toBe('#ff0000')
  })

  it('refuses a colour that is not hex', () => {
    expect(createSetVariableValueOperations(withVariable, 'ink', 'red')).toEqual([])
  })

  it('reads a number variable value as a number', () => {
    const numbers = run(base, createNewVariableOperations(base, 'number', 'n1'))
    const [operation] = createSetVariableValueOperations(numbers, 'n1', '14')
    expect(operation).toMatchObject({ kind: 'setVariable', variable: { value: 14 } })
    expect(createSetVariableValueOperations(numbers, 'n1', 'abc')).toEqual([])
  })
})

describe('applying to a node', () => {
  const withVariable = run(base, [
    { kind: 'setVariable', variable: { id: 'ink', name: 'Ink', kind: 'color', value: '#000000' } }
  ])

  it('binds a property to a variable and takes its value', () => {
    const bound = run(
      withVariable,
      createBindVariableOperations(withVariable, 'box', 'fill', 'ink')
    )
    expect(bound.nodes.box).toMatchObject({ fill: '#000000', bindings: { fill: 'ink' } })
  })

  it('detaches a binding and keeps the value', () => {
    const bound = run(
      withVariable,
      createBindVariableOperations(withVariable, 'box', 'fill', 'ink')
    )
    const detached = run(bound, createBindVariableOperations(bound, 'box', 'fill', undefined))
    expect(detached.nodes.box?.bindings).toBeUndefined()
    expect(detached.nodes.box?.fill).toBe('#000000')
  })

  it('applies a text style and detaches it', () => {
    const styled = run(base, createNewTextStyleOperations(base, 'label', 's1'))
    const style = styled.textStyles?.s1
    if (!style) throw new Error('style missing')
    const changed = run(styled, [{ kind: 'setTextStyle', style: { ...style, fontSize: 30 } }])
    const applied = run(changed, createApplyTextStyleOperations('label', 's1'))
    expect(applied.nodes.label).toMatchObject({ textStyleId: 's1', fontSize: 30 })
    const detached = run(applied, createApplyTextStyleOperations('label', undefined))
    expect(detached.nodes.label?.textStyleId).toBeUndefined()
    expect(detached.nodes.label?.fontSize).toBe(30)
  })

  it('lists text styles in name order', () => {
    const one = run(base, createNewTextStyleOperations(base, 'label', 's1'))
    expect(listTextStyles(one).map((style) => style.id)).toEqual(['s1'])
  })
})
