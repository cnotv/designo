import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it, vi } from 'vitest'
import { estimateTextBox } from './geometry.ts'
import { createTextCommitOperations, getTextOverlayLayout } from './textEditing.ts'
import type { TextBoxMeasurer } from './types.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const document = unwrap(
  applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'label',
      type: 'text',
      parentId: 'page',
      properties: { x: 100, y: 50, width: 40, height: 20, text: 'Hi', fontSize: 16, rotation: 30 }
    }
  ])
)
const label = document.nodes['label']!

const layoutOf = (
  node: typeof label,
  viewport: { offsetX: number; offsetY: number; scale: number },
  draft: string,
  measure: TextBoxMeasurer = estimateTextBox
) => getTextOverlayLayout(node, viewport, draft, measure)

describe('getTextOverlayLayout', () => {
  it('follows the node through pan and zoom', () => {
    const layout = layoutOf(label, { offsetX: 10, offsetY: 20, scale: 2 }, 'Hi')
    expect(layout).toMatchObject({
      left: 210,
      top: 120,
      fontSize: 32,
      lineHeight: 38.4,
      rotation: 30
    })
  })

  it('takes its line spacing and alignment from the node', () => {
    const roomy = { ...label, lineHeight: 2, textAlign: 'right' as const }
    expect(layoutOf(roomy, { offsetX: 0, offsetY: 0, scale: 2 }, 'Hi')).toMatchObject({
      lineHeight: 64,
      textAlign: 'right'
    })
  })

  it('is the size the canvas lays the draft out in, scaled to the screen', () => {
    const measure = vi.fn<TextBoxMeasurer>(() => ({ width: 123.5, height: 40 }))
    const layout = layoutOf(label, { offsetX: 0, offsetY: 0, scale: 2 }, 'Hi there', measure)
    expect(layout).toMatchObject({ width: 247, height: 80 })
    expect(measure).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hi there', wrapWidth: undefined, fontSize: 16 })
    )
  })

  it('stays as wide as a fixed-width node, however short the draft, and wraps there', () => {
    const fixed = { ...label, width: 300, textWrap: true }
    const measure = vi.fn<TextBoxMeasurer>(() => ({ width: 300, height: 57.6 }))
    const layout = layoutOf(fixed, { offsetX: 0, offsetY: 0, scale: 1 }, 'Hi', measure)
    expect(layout).toMatchObject({ width: 300, height: 57.6, isWrapping: true })
    expect(measure).toHaveBeenCalledWith(expect.objectContaining({ wrapWidth: 300 }))
  })

  it('does not wrap an auto-width node', () => {
    expect(layoutOf(label, { offsetX: 0, offsetY: 0, scale: 1 }, 'Hi').isWrapping).toBe(false)
  })

  it('grows as tall as a fixed-width draft wraps to', () => {
    const fixed = { ...label, width: 60, textWrap: true }
    const viewport = { offsetX: 0, offsetY: 0, scale: 1 }
    const short = layoutOf(fixed, viewport, 'Hi')
    const long = layoutOf(fixed, viewport, 'a long draft that has to wrap onto several lines')
    expect(long.height).toBeGreaterThan(short.height)
    expect(long.width).toBe(60)
  })

  it('turns around the node centre, as the canvas does, even as the draft grows', () => {
    const viewport = { offsetX: 0, offsetY: 0, scale: 2 }
    const grown = layoutOf(label, viewport, 'a much longer first line\nsecond')
    expect(grown).toMatchObject({ rotationOriginX: 40, rotationOriginY: 20 })
  })

  it('grows with the draft lines and longest line', () => {
    const viewport = { offsetX: 0, offsetY: 0, scale: 1 }
    const single = layoutOf(label, viewport, 'Hi')
    const grown = layoutOf(label, viewport, 'a much longer first line\nsecond')
    expect(grown.height).toBeGreaterThan(single.height)
    expect(grown.width).toBeGreaterThan(single.width)
  })
})

describe('createTextCommitOperations', () => {
  it('commits changed text as one update', () => {
    const operations = createTextCommitOperations(
      document,
      { nodeId: 'label', isNew: false },
      'one\ntwo',
      estimateTextBox
    )
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      kind: 'update',
      id: 'label',
      patch: { text: 'one\ntwo' }
    })
  })

  it('fits the node height to the lines', () => {
    const [operation] = createTextCommitOperations(
      document,
      { nodeId: 'label', isNew: false },
      'one\ntwo\nthree',
      estimateTextBox
    )
    expect(operation).toMatchObject({ patch: { height: 58 } })
  })

  it('does nothing when the text is unchanged', () => {
    expect(
      createTextCommitOperations(document, { nodeId: 'label', isNew: false }, 'Hi', estimateTextBox)
    ).toEqual([])
  })

  it('deletes a new node left empty', () => {
    expect(
      createTextCommitOperations(
        document,
        { nodeId: 'label', isNew: true },
        '  \n',
        estimateTextBox
      )
    ).toEqual([{ kind: 'delete', id: 'label' }])
  })

  it('keeps a new node that has text, even when it equals the placeholder', () => {
    const operations = createTextCommitOperations(
      document,
      { nodeId: 'label', isNew: true },
      'Hi',
      estimateTextBox
    )
    expect(operations).toHaveLength(1)
  })

  it('gives nothing for a node that is gone', () => {
    expect(
      createTextCommitOperations(document, { nodeId: 'gone', isNew: false }, 'x', estimateTextBox)
    ).toEqual([])
  })
})
