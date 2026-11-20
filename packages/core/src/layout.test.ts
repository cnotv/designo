import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from './document.ts'
import type { DesignDocument, DesignNodePatch, OperationResult } from './types.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const box = (id: string, parentId: string, properties: DesignNodePatch = {}) =>
  ({ kind: 'create', id, type: 'rectangle', parentId, properties }) as const

const row = (frame: DesignNodePatch, children: readonly DesignNodePatch[]): DesignDocument =>
  unwrap(
    applyOperations(createDocument('d', 'D', 'p'), [
      {
        kind: 'create',
        id: 'f',
        type: 'frame',
        parentId: 'p',
        properties: { x: 10, y: 20, width: 300, height: 100, layoutMode: 'horizontal', ...frame }
      },
      ...children.map((properties, index) => box(`c${index}`, 'f', properties))
    ])
  )

const boxOf = (document: DesignDocument, id: string) => {
  const node = document.nodes[id]
  if (!node) throw new Error(id)
  return { x: node.x, y: node.y, width: node.width, height: node.height }
}

describe('auto-layout', () => {
  it('places children in a row with gap and padding, in absolute coordinates', () => {
    const document = row({ layoutGap: 10, layoutPadding: 5 }, [
      { width: 50, height: 20 },
      { width: 40, height: 30 }
    ])
    expect(boxOf(document, 'c0')).toEqual({ x: 15, y: 25, width: 50, height: 20 })
    expect(boxOf(document, 'c1')).toEqual({ x: 75, y: 25, width: 40, height: 30 })
  })

  it('stacks children in a column', () => {
    const document = row({ layoutMode: 'vertical', layoutGap: 4 }, [
      { width: 50, height: 20 },
      { width: 40, height: 30 }
    ])
    expect(boxOf(document, 'c1')).toMatchObject({ x: 10, y: 44 })
  })

  it('aligns on the main axis: center, end and space-between', () => {
    const children = [{ width: 50 }, { width: 50 }]
    expect(boxOf(row({ layoutAlign: 'center' }, children), 'c0').x).toBe(10 + 100)
    expect(boxOf(row({ layoutAlign: 'end' }, children), 'c0').x).toBe(10 + 200)
    const spread = row({ layoutAlign: 'space-between' }, children)
    expect(boxOf(spread, 'c0').x).toBe(10)
    expect(boxOf(spread, 'c1').x).toBe(10 + 250)
  })

  it('aligns on the cross axis', () => {
    const children = [{ width: 50, height: 40 }]
    expect(boxOf(row({ layoutCrossAlign: 'center' }, children), 'c0').y).toBe(20 + 30)
    expect(boxOf(row({ layoutCrossAlign: 'end' }, children), 'c0').y).toBe(20 + 60)
  })

  it('shares the free main space between fill children, and stretches them across', () => {
    const document = row({ layoutGap: 10, layoutPadding: 10 }, [
      { width: 80, widthSizing: 'fill', heightSizing: 'fill' },
      { width: 60 },
      { width: 1, widthSizing: 'fill' }
    ])
    // 300 - 2 * 10 padding - 60 fixed - 2 * 10 gap = 200, so 100 each
    expect(boxOf(document, 'c0')).toEqual({ x: 20, y: 30, width: 100, height: 80 })
    expect(boxOf(document, 'c2').width).toBe(100)
    expect(boxOf(document, 'c2').x).toBe(20 + 100 + 10 + 60 + 10)
  })

  it('sizes a hugging frame to its children plus padding', () => {
    const document = row(
      { widthSizing: 'hug', heightSizing: 'hug', layoutGap: 10, layoutPadding: 5 },
      [
        { width: 50, height: 20 },
        { width: 40, height: 30 }
      ]
    )
    expect(boxOf(document, 'f')).toMatchObject({ width: 110, height: 40 })
  })

  it('lays out nested frames, hugging from the inside out', () => {
    const document = unwrap(
      applyOperations(createDocument('d', 'D', 'p'), [
        {
          kind: 'create',
          id: 'outer',
          type: 'frame',
          parentId: 'p',
          properties: {
            layoutMode: 'vertical',
            widthSizing: 'hug',
            heightSizing: 'hug',
            layoutPadding: 10
          }
        },
        {
          kind: 'create',
          id: 'inner',
          type: 'frame',
          parentId: 'outer',
          properties: {
            layoutMode: 'horizontal',
            widthSizing: 'hug',
            heightSizing: 'hug',
            layoutGap: 5
          }
        },
        box('a', 'inner', { width: 30, height: 10 }),
        box('b', 'inner', { width: 30, height: 20 })
      ])
    )
    expect(boxOf(document, 'inner')).toMatchObject({ x: 10, y: 10, width: 65, height: 20 })
    expect(boxOf(document, 'outer')).toMatchObject({ width: 85, height: 40 })
  })

  it('relays out when a child changes, is deleted or moves out', () => {
    const document = row({ layoutGap: 10 }, [{ width: 50 }, { width: 50 }])
    const changed = unwrap(
      applyOperations(document, [{ kind: 'update', id: 'c0', patch: { width: 80 } }])
    )
    expect(boxOf(changed, 'c1').x).toBe(10 + 80 + 10)
    const deleted = unwrap(applyOperations(changed, [{ kind: 'delete', id: 'c0' }]))
    expect(boxOf(deleted, 'c1').x).toBe(10)
  })

  it('skips hidden children', () => {
    const document = row({ layoutGap: 10 }, [{ width: 50, visible: false }, { width: 50 }])
    expect(boxOf(document, 'c1').x).toBe(10)
  })

  it('leaves a document without auto-layout untouched', () => {
    const document = createDocument('d', 'D', 'p')
    const result = unwrap(applyOperations(document, [box('r', 'p', { x: 3 })]))
    expect(boxOf(result, 'r').x).toBe(3)
  })

  it('refuses auto-layout on anything but a frame, and negative spacing', () => {
    const base = createDocument('d', 'D', 'p')
    expect(applyOperations(base, [box('r', 'p', { layoutMode: 'vertical' })])).toMatchObject({
      ok: false
    })
    expect(
      applyOperations(base, [
        { kind: 'create', id: 'f', type: 'frame', parentId: 'p', properties: { layoutGap: -1 } }
      ])
    ).toMatchObject({ ok: false })
  })
})
