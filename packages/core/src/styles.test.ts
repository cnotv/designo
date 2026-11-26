import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from './document.ts'
import { invertOperations } from './history.ts'
import type { DesignDocument, DesignOperation, DesignVariable, OperationResult } from './types.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const ink: DesignVariable = { id: 'ink', name: 'Ink', kind: 'color', value: '#111111' }
const inkVariable: DesignOperation = { kind: 'setVariable', variable: ink }

const bodyStyle: DesignOperation = {
  kind: 'setTextStyle',
  style: {
    id: 'body',
    name: 'Body',
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: 1.4,
    letterSpacing: 0
  }
}

const twentyBoxes: DesignOperation[] = Array.from({ length: 20 }, (_, index) => ({
  kind: 'create' as const,
  id: `box-${index}`,
  type: 'rectangle' as const,
  parentId: 'page',
  properties: { fill: '#ffffff', bindings: { fill: 'ink' } }
}))

const boundDocument = (): DesignDocument =>
  unwrap(applyOperations(createDocument('file', 'File', 'page'), [inkVariable, ...twentyBoxes]))

const styledDocument = (): DesignDocument =>
  unwrap(
    applyOperations(createDocument('file', 'File', 'page'), [
      bodyStyle,
      { kind: 'create', id: 'label', type: 'text', parentId: 'page', properties: { text: 'Hi' } },
      { kind: 'update', id: 'label', patch: { textStyleId: 'body' } }
    ])
  )

describe('variables', () => {
  it('resolves a binding into the node when it is set', () => {
    expect(boundDocument().nodes['box-0']?.fill).toBe('#111111')
  })

  it('changes the colour of twenty nodes with one operation', () => {
    const changed = unwrap(
      applyOperations(boundDocument(), [
        { kind: 'setVariable', variable: { ...ink, value: '#ff0000' } }
      ])
    )
    const fills = Object.values(changed.nodes)
      .filter((node) => node.type === 'rectangle')
      .map((node) => node.fill)
    expect(fills).toHaveLength(20)
    expect(new Set(fills)).toEqual(new Set(['#ff0000']))
  })

  it('binds a number variable to a number property', () => {
    const document = unwrap(
      applyOperations(createDocument('file', 'File', 'page'), [
        { kind: 'setVariable', variable: { id: 'round', name: 'Round', kind: 'number', value: 8 } },
        {
          kind: 'create',
          id: 'card',
          type: 'rectangle',
          parentId: 'page',
          properties: { bindings: { cornerRadius: 'round' } }
        }
      ])
    )
    expect(document.nodes['card']?.cornerRadius).toBe(8)
  })

  it('unbinds a property that is edited directly, keeping the new value', () => {
    const edited = unwrap(
      applyOperations(boundDocument(), [
        { kind: 'update', id: 'box-0', patch: { fill: '#00ff00' } },
        { kind: 'setVariable', variable: { ...ink, value: '#ff0000' } }
      ])
    )
    expect(edited.nodes['box-0']?.fill).toBe('#00ff00')
    expect(edited.nodes['box-0']?.bindings).toBeUndefined()
    expect(edited.nodes['box-1']?.fill).toBe('#ff0000')
  })

  it('keeps the last value on nodes when the variable is deleted', () => {
    const deleted = unwrap(
      applyOperations(boundDocument(), [{ kind: 'deleteVariable', id: 'ink' }])
    )
    expect(deleted.variables).toBeUndefined()
    expect(deleted.nodes['box-0']?.fill).toBe('#111111')
    expect(deleted.nodes['box-0']?.bindings).toBeUndefined()
  })

  it('refuses a binding to a missing variable', () => {
    const result = applyOperations(createDocument('file', 'File', 'page'), [
      {
        kind: 'create',
        id: 'box',
        type: 'rectangle',
        parentId: 'page',
        properties: { bindings: { fill: 'missing' } }
      }
    ])
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('variable missing')
    })
  })

  it('refuses a colour variable on a number property, and a bad value', () => {
    const wrongKind = applyOperations(boundDocument(), [
      { kind: 'update', id: 'box-0', patch: { bindings: { cornerRadius: 'ink' } } }
    ])
    expect(wrongKind.ok).toBe(false)
    const badColour = applyOperations(createDocument('file', 'File', 'page'), [
      { kind: 'setVariable', variable: { id: 'bad', name: 'Bad', kind: 'color', value: 'red' } }
    ])
    expect(badColour.ok).toBe(false)
  })

  it('refuses a change that would make a bound property invalid', () => {
    const result = applyOperations(boundDocument(), [
      { kind: 'setVariable', variable: { ...ink, kind: 'number', value: 3 } }
    ])
    expect(result.ok).toBe(false)
  })

  it('undoes setting, adding and deleting a variable', () => {
    const start = boundDocument()
    const changes: DesignOperation[][] = [
      [{ kind: 'setVariable', variable: { ...ink, value: '#ff0000' } }],
      [
        {
          kind: 'setVariable',
          variable: { id: 'paper', name: 'Paper', kind: 'color', value: '#ffffff' }
        }
      ],
      [{ kind: 'deleteVariable', id: 'ink' }]
    ]
    changes.forEach((operations) => {
      const changed = unwrap(applyOperations(start, operations))
      expect(unwrap(applyOperations(changed, invertOperations(start, operations)))).toEqual(start)
    })
  })

  it('undoes a direct edit of a bound property back into the binding', () => {
    const start = boundDocument()
    const operations: DesignOperation[] = [
      { kind: 'update', id: 'box-0', patch: { fill: '#00ff00' } }
    ]
    const edited = unwrap(applyOperations(start, operations))
    expect(unwrap(applyOperations(edited, invertOperations(start, operations)))).toEqual(start)
  })
})

describe('text styles', () => {
  it('gives a text node the style values', () => {
    const label = styledDocument().nodes['label']
    expect([label?.fontSize, label?.fontFamily, label?.lineHeight]).toEqual([11, 'Inter', 1.4])
  })

  it('updates every text that uses a style', () => {
    const changed = unwrap(
      applyOperations(styledDocument(), [
        { kind: 'setTextStyle', style: { ...bodyStyle.style, fontSize: 14 } }
      ])
    )
    expect(changed.nodes['label']?.fontSize).toBe(14)
  })

  it('keeps a property the node overrides, and follows the style for the rest', () => {
    const changed = unwrap(
      applyOperations(styledDocument(), [
        { kind: 'update', id: 'label', patch: { fontSize: 20 } },
        { kind: 'setTextStyle', style: { ...bodyStyle.style, fontSize: 14, fontWeight: 700 } }
      ])
    )
    expect(changed.nodes['label']?.fontSize).toBe(20)
    expect(changed.nodes['label']?.fontWeight).toBe(700)
    expect(changed.nodes['label']?.styleOverrides).toEqual(['fontSize'])
  })

  it('stops following the style when it is removed from the node', () => {
    const detached = unwrap(
      applyOperations(styledDocument(), [
        { kind: 'update', id: 'label', patch: { textStyleId: null } },
        { kind: 'setTextStyle', style: { ...bodyStyle.style, fontSize: 14 } }
      ])
    )
    expect(detached.nodes['label']?.fontSize).toBe(11)
    expect(detached.nodes['label']?.textStyleId).toBeUndefined()
  })

  it('unlinks nodes when the style is deleted, keeping their values', () => {
    const deleted = unwrap(
      applyOperations(styledDocument(), [{ kind: 'deleteTextStyle', id: 'body' }])
    )
    expect(deleted.textStyles).toBeUndefined()
    expect(deleted.nodes['label']?.fontSize).toBe(11)
    expect(deleted.nodes['label']?.textStyleId).toBeUndefined()
  })

  it('refuses a missing style and an unusable size', () => {
    expect(
      applyOperations(styledDocument(), [
        { kind: 'update', id: 'label', patch: { textStyleId: 'nope' } }
      ]).ok
    ).toBe(false)
    expect(
      applyOperations(styledDocument(), [
        { kind: 'setTextStyle', style: { ...bodyStyle.style, fontSize: 0 } }
      ]).ok
    ).toBe(false)
  })

  it('undoes changing and deleting a style', () => {
    const start = styledDocument()
    const changes: DesignOperation[][] = [
      [{ kind: 'setTextStyle', style: { ...bodyStyle.style, fontSize: 14 } }],
      [{ kind: 'deleteTextStyle', id: 'body' }]
    ]
    changes.forEach((operations) => {
      const changed = unwrap(applyOperations(start, operations))
      expect(unwrap(applyOperations(changed, invertOperations(start, operations)))).toEqual(start)
    })
  })

  it('keeps a text style on an instance of a component', () => {
    const document = unwrap(
      applyOperations(createDocument('file', 'File', 'page'), [
        bodyStyle,
        { kind: 'create', id: 'card', type: 'frame', parentId: 'page' },
        {
          kind: 'create',
          id: 'label',
          type: 'text',
          parentId: 'card',
          properties: { textStyleId: 'body' }
        },
        { kind: 'update', id: 'card', patch: { isComponent: true } },
        { kind: 'createInstance', id: 'copy', componentId: 'card', parentId: 'page' },
        { kind: 'setTextStyle', style: { ...bodyStyle.style, fontSize: 30 } }
      ])
    )
    expect(document.nodes['copy:label']?.fontSize).toBe(30)
  })
})
