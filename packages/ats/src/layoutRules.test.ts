import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument, type DesignDocument } from '@designo/core'
import { checkLayoutTraps } from './layoutRules.ts'
import { getPlacedNodes } from './scope.ts'

const build = (
  ...nodes: { id: string; type: 'text' | 'image'; properties: Record<string, unknown> }[]
): DesignDocument => {
  const result = applyOperations(createDocument('f', 'Resume', 'page'), [
    {
      kind: 'create',
      id: 'sheet',
      type: 'frame',
      parentId: 'page',
      properties: { x: 0, y: 0, width: 600, height: 800, pdfPage: 1 }
    },
    ...nodes.map((node) => ({ kind: 'create' as const, parentId: 'sheet', ...node }))
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}
const text = (id: string, value: string, x: number, y: number) => ({
  id,
  type: 'text' as const,
  properties: { x, y, width: 100, height: 20, text: value }
})
const body = text('body', 'Experience', 50, 300)
const anchor = {
  id: 'anchor',
  type: 'text' as const,
  properties: { x: 50, y: 0, width: 10, height: 10, text: 'Top' }
}

const run = (...nodes: Parameters<typeof build>) =>
  checkLayoutTraps(getPlacedNodes(build(...nodes)))

describe('checkLayoutTraps', () => {
  it('passes plain body text', () => {
    expect(run(text('a', 'Jane Doe', 50, 100), body, text('z', 'End', 50, 500))).toEqual([
      expect.objectContaining({ status: 'pass' })
    ])
  })

  it('warns about text in the footer strip of the page', () => {
    const findings = run(anchor, body, text('foot', 'Page 1', 50, 780))
    expect(findings).toContainEqual(
      expect.objectContaining({
        status: 'warn',
        nodeId: 'foot',
        message: expect.stringContaining('footer')
      })
    )
  })

  it('warns about text over a picture', () => {
    const picture = {
      id: 'pic',
      type: 'image' as const,
      properties: { x: 40, y: 280, width: 200, height: 80 }
    }
    const findings = run(anchor, picture, body)
    expect(findings).toContainEqual(
      expect.objectContaining({ nodeId: 'body', message: expect.stringContaining('picture') })
    )
  })

  it('warns about an icon where a word should be', () => {
    const findings = run(anchor, text('icon', '☎', 50, 200), body)
    expect(findings).toContainEqual(
      expect.objectContaining({ nodeId: 'icon', message: expect.stringContaining('icon') })
    )
  })
})
