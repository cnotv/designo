import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type OperationResult
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import { resizeBounds, estimateTextSize, getTextBaselineOffset } from './geometry.ts'
import { getLayerRows } from './layers.ts'
import { EMPTY_HISTORY, recordHistoryEntry, takeRedo, takeUndo } from './history.ts'
import {
  createDeleteOperations,
  createDrawOperation,
  createMoveOperations,
  createPropertyOperations
} from './operations.ts'
import {
  findContainerAtPoint,
  findNodeAtPoint,
  findNodesInBounds,
  getTopmostIds,
  toggleInSelection
} from './selection.ts'
import { screenToWorld, worldToScreen, zoomAt } from './viewport.ts'

const unwrap = (result: OperationResult): DesignDocument => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

// A frame at (100, 100) of 200 x 200 holding a box at (120, 120) of 50 x 50, and a circle outside it.
const document = unwrap(
  applyOperations(createDocument('file', 'File', 'page'), [
    {
      kind: 'create',
      id: 'frame',
      type: 'frame',
      parentId: 'page',
      properties: { x: 100, y: 100, width: 200, height: 200 }
    },
    {
      kind: 'create',
      id: 'box',
      type: 'rectangle',
      parentId: 'frame',
      properties: { x: 120, y: 120, width: 50, height: 50 }
    },
    {
      kind: 'create',
      id: 'dot',
      type: 'ellipse',
      parentId: 'page',
      properties: { x: 400, y: 100, width: 40, height: 40 }
    }
  ])
)

describe('viewport', () => {
  it('converts between screen and world both ways', () => {
    const viewport = { offsetX: 50, offsetY: -20, scale: 2 }
    expect(worldToScreen(viewport, screenToWorld(viewport, { x: 300, y: 140 }))).toEqual({
      x: 300,
      y: 140
    })
  })

  it('keeps the point under the pointer still while zooming', () => {
    const viewport = { offsetX: 10, offsetY: 10, scale: 1 }
    const pointer = { x: 200, y: 150 }
    const before = screenToWorld(viewport, pointer)
    const after = screenToWorld(zoomAt(viewport, pointer, 2.5), pointer)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('stops zooming in at 6400%', () => {
    expect(zoomAt({ offsetX: 0, offsetY: 0, scale: 60 }, { x: 0, y: 0 }, 2).scale).toBe(64)
  })
})

describe('selection', () => {
  it('picks the node drawn on top, a child over its frame', () => {
    expect(findNodeAtPoint(document, { x: 130, y: 130 })?.id).toBe('box')
    expect(findNodeAtPoint(document, { x: 250, y: 250 })?.id).toBe('frame')
    expect(findNodeAtPoint(document, { x: 600, y: 600 })).toBeUndefined()
  })

  it('draws into the frame under the pointer, else onto the page', () => {
    expect(findContainerAtPoint(document, { x: 250, y: 250 })).toBe('frame')
    expect(findContainerAtPoint(document, { x: 10, y: 10 })).toBe('page')
  })

  it('keeps only the outermost of nested ids', () => {
    expect(getTopmostIds(document, ['box', 'frame', 'dot'])).toEqual(['frame', 'dot'])
  })

  it('selects with a marquee without doubling a frame and its contents', () => {
    expect(findNodesInBounds(document, { x: 0, y: 0, width: 500, height: 500 })).toEqual([
      'frame',
      'dot'
    ])
    expect(findNodesInBounds(document, { x: 390, y: 90, width: 20, height: 20 })).toEqual(['dot'])
  })

  it('toggles an id in and out', () => {
    expect(toggleInSelection(['box'], 'dot')).toEqual(['box', 'dot'])
    expect(toggleInSelection(['box', 'dot'], 'box')).toEqual(['dot'])
  })
})

describe('getTextBaselineOffset', () => {
  it('centres the font in the line height, as CSS does', () => {
    // 20px text: a 25px line, 18 + 4 of font, so 1.5 above the ascent.
    expect(getTextBaselineOffset(0, 20, 18, 4)).toBe(19.5)
  })

  it('steps one line height per line', () => {
    expect(getTextBaselineOffset(2, 20, 18, 4)).toBe(69.5)
  })
})

describe('geometry', () => {
  it('resizes from the bottom-right handle', () => {
    expect(resizeBounds({ x: 0, y: 0, width: 100, height: 50 }, 'se', 20, 10)).toEqual({
      x: 0,
      y: 0,
      width: 120,
      height: 60
    })
  })

  it('flips instead of going negative when dragged past the opposite edge', () => {
    expect(resizeBounds({ x: 0, y: 0, width: 100, height: 50 }, 'e', -150, 0)).toEqual({
      x: -50,
      y: 0,
      width: 50,
      height: 50
    })
  })

  it('moves only one edge from a side handle', () => {
    expect(resizeBounds({ x: 10, y: 10, width: 100, height: 100 }, 'n', 30, -20)).toEqual({
      x: 10,
      y: -10,
      width: 100,
      height: 120
    })
  })

  it('sizes text by its longest line and line count', () => {
    const size = estimateTextSize('ab\nabcd', 10)
    expect(size.height).toBe(25)
    expect(size.width).toBeGreaterThan(estimateTextSize('ab', 10).width)
  })
})

describe('operations', () => {
  it('moves a frame together with what it holds', () => {
    const moved = unwrap(
      applyOperations(document, createMoveOperations(document, ['frame', 'box'], 10, 5))
    )
    expect([moved.nodes.frame?.x, moved.nodes.box?.x, moved.nodes.box?.y]).toEqual([110, 130, 125])
    expect(moved.nodes.dot?.x).toBe(400)
  })

  it('makes no update for a move of zero', () => {
    expect(createMoveOperations(document, ['box'], 0, 0)).toEqual([])
  })

  it('gives a click without a drag a default size', () => {
    const operation = createDrawOperation({
      tool: 'rectangle',
      nodeId: 'new',
      parentId: 'page',
      start: { x: 5, y: 5 },
      current: { x: 6, y: 5 },
      keepSquare: false
    })
    expect(operation).toMatchObject({ properties: { x: 5, y: 5, width: 100, height: 100 } })
  })

  it('draws a square with shift, towards the drag', () => {
    const operation = createDrawOperation({
      tool: 'ellipse',
      nodeId: 'new',
      parentId: 'page',
      start: { x: 100, y: 100 },
      current: { x: 40, y: 80 },
      keepSquare: true
    })
    expect(operation).toMatchObject({ properties: { x: 40, y: 40, width: 60, height: 60 } })
  })

  it('deletes a frame once, not its contents again', () => {
    expect(createDeleteOperations(document, ['box', 'frame'])).toEqual([
      { kind: 'delete', id: 'frame' }
    ])
  })

  it('resizes a text node when its words change', () => {
    const withText = unwrap(
      applyOperations(document, [
        createDrawOperation({
          tool: 'text',
          nodeId: 'label',
          parentId: 'page',
          start: { x: 0, y: 0 },
          current: { x: 0, y: 0 },
          keepSquare: false
        })
      ])
    )
    const [operation] = createPropertyOperations(withText, 'label', { text: 'A much longer label' })
    expect(operation).toMatchObject({ patch: { text: 'A much longer label' } })
    expect(
      operation?.kind === 'update' &&
        (operation.patch.width ?? 0) > (withText.nodes.label?.width ?? 0)
    ).toBe(true)
  })
})

describe('history', () => {
  const entry = (name: string) => ({
    forward: [{ kind: 'delete' as const, id: name }],
    backward: [{ kind: 'delete' as const, id: `${name}-back` }]
  })

  it('undoes and redoes in order', () => {
    const history = recordHistoryEntry(
      recordHistoryEntry(EMPTY_HISTORY, entry('first')),
      entry('second')
    )
    const undone = takeUndo(history)
    expect(undone?.entry).toEqual(entry('second'))
    const redone = undone && takeRedo(undone.history)
    expect(redone?.entry).toEqual(entry('second'))
    expect(redone?.history.undoStack).toHaveLength(2)
  })

  it('clears redo when a new step is recorded', () => {
    const undone = takeUndo(recordHistoryEntry(EMPTY_HISTORY, entry('first')))
    expect(undone && recordHistoryEntry(undone.history, entry('other')).redoStack).toEqual([])
  })

  it('has nothing to undo at the start', () => {
    expect(takeUndo(EMPTY_HISTORY)).toBeUndefined()
  })
})

describe('layers', () => {
  it('nests children under their frame, topmost layer first', () => {
    expect(getLayerRows(document).map(({ node, depth }) => `${depth}:${node.id}`)).toEqual([
      '0:dot',
      '0:frame',
      '1:box'
    ])
  })
})
