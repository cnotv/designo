import { describe, expect, it } from 'vitest'
import { applyOperation, createDocument } from './document.ts'
import { checkTextSpans, clampSpansToText, clampTextSpans, getSpanFace } from './textSpans.ts'
import { DEFAULT_NODE_PROPERTIES } from './defaults.ts'
import type { DesignNode } from './types.ts'

const textNode = (text: string, spans: DesignNode['spans']): DesignNode => ({
  ...DEFAULT_NODE_PROPERTIES,
  id: 'text-a',
  type: 'text',
  parentId: 'page-a',
  order: 0,
  text,
  spans
})

describe('text spans', () => {
  it('cuts spans to a shorter text and drops the empty ones', () => {
    const spans = [
      { start: 0, end: 4, fontWeight: 700 },
      { start: 6, end: 9, fill: '#ff0000' }
    ]
    expect(clampTextSpans(spans, 7)).toEqual([
      { start: 0, end: 4, fontWeight: 700 },
      { start: 6, end: 7, fill: '#ff0000' }
    ])
    expect(clampTextSpans(spans, 3)).toEqual([{ start: 0, end: 3, fontWeight: 700 }])
  })

  it('clamps spans when a patch changes only the text', () => {
    const node = textNode('Hello world', [{ start: 6, end: 11, fontWeight: 700 }])
    expect(clampSpansToText({ text: 'Hello' }, node)).toEqual({ text: 'Hello', spans: [] })
    expect(clampSpansToText({ text: 'Hi', spans: [] }, node)).toEqual({ text: 'Hi', spans: [] })
    expect(clampSpansToText({ fontSize: 9 }, node)).toEqual({ fontSize: 9 })
  })

  it('names spans that are out of order, overlapping or past the text', () => {
    expect(
      checkTextSpans(
        textNode('abcdef', [
          { start: 0, end: 3 },
          { start: 3, end: 6 }
        ])
      )
    ).toBe(undefined)
    expect(checkTextSpans(textNode('abc', [{ start: 0, end: 4 }]))).toContain('past the end')
    expect(
      checkTextSpans(
        textNode('abcdef', [
          { start: 0, end: 4 },
          { start: 3, end: 5 }
        ])
      )
    ).toContain('overlapping')
    expect(checkTextSpans(textNode('abc', [{ start: 2, end: 2 }]))).toContain('empty')
  })

  it('takes the node face and the span overrides', () => {
    const node = textNode('x', [])
    expect(getSpanFace(node, { start: 0, end: 1, fontWeight: 700 })).toEqual({
      fontFamily: node.fontFamily,
      fontWeight: 700,
      fontStyle: 'normal'
    })
  })

  it('rejects an operation that leaves a span outside the text', () => {
    const document = createDocument('file-a', 'Doc', 'page-a')
    const created = applyOperation(document, {
      kind: 'create',
      id: 'text-a',
      type: 'text',
      parentId: 'page-a',
      properties: { text: 'Hello', spans: [{ start: 0, end: 9, fontWeight: 700 }] }
    })
    expect(created.ok).toBe(false)
  })

  it('keeps spans inside the text when the words shrink', () => {
    const document = createDocument('file-a', 'Doc', 'page-a')
    const created = applyOperation(document, {
      kind: 'create',
      id: 'text-a',
      type: 'text',
      parentId: 'page-a',
      properties: { text: 'Hello world', spans: [{ start: 6, end: 11, fontWeight: 700 }] }
    })
    if (!created.ok) throw new Error(created.error)
    const edited = applyOperation(created.document, {
      kind: 'update',
      id: 'text-a',
      patch: { text: 'Hello' }
    })
    expect(edited.ok && edited.document.nodes['text-a']?.spans).toEqual([])
  })
})
