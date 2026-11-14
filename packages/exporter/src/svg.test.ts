import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignOperation
} from '@designo/core'
import { exportNodeToSvg } from './svg.ts'

const build = (operations: DesignOperation[]): DesignDocument => {
  const result = applyOperations(createDocument('file', 'Test', 'page'), operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

describe('exportNodeToSvg', () => {
  it('uses the node bounds as the viewBox and size', () => {
    const document = build([
      {
        kind: 'create',
        id: 'box',
        type: 'rectangle',
        parentId: 'page',
        properties: { x: 40, y: 60, width: 200, height: 100, fill: '#ff0000' }
      }
    ])
    expect(exportNodeToSvg(document, 'box')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="40 60 200 100">' +
        '<rect x="40" y="60" width="200" height="100" fill="#ff0000"/>' +
        '</svg>'
    )
  })

  it('renders corner radius, stroke and opacity', () => {
    const document = build([
      {
        kind: 'create',
        id: 'box',
        type: 'rectangle',
        parentId: 'page',
        properties: {
          width: 10,
          height: 10,
          cornerRadius: 3,
          stroke: '#000000',
          strokeWidth: 2,
          opacity: 0.5
        }
      }
    ])
    expect(exportNodeToSvg(document, 'box')).toContain(
      '<rect x="0" y="0" width="10" height="10" rx="3" ry="3" fill="#d9d9d9" stroke="#000000" stroke-width="2" opacity="0.5"/>'
    )
  })

  it('renders ellipses and rotation about the node centre', () => {
    const document = build([
      {
        kind: 'create',
        id: 'oval',
        type: 'ellipse',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 20, height: 10, rotation: 90, fill: null }
      }
    ])
    expect(exportNodeToSvg(document, 'oval')).toContain(
      '<ellipse cx="10" cy="5" rx="10" ry="5" fill="none" transform="rotate(90 10 5)"/>'
    )
  })

  it('clips a frame children with a clipPath and keeps paint order', () => {
    const document = build([
      {
        kind: 'create',
        id: 'card',
        type: 'frame',
        parentId: 'page',
        properties: { width: 100, height: 50, fill: '#ffffff', cornerRadius: 4 }
      },
      {
        kind: 'create',
        id: 'a',
        type: 'rectangle',
        parentId: 'card',
        properties: { fill: '#111111' }
      },
      {
        kind: 'create',
        id: 'b',
        type: 'rectangle',
        parentId: 'card',
        properties: { fill: '#222222' }
      }
    ])
    const svg = exportNodeToSvg(document, 'card')
    expect(svg).toContain(
      '<clipPath id="clip-card"><rect x="0" y="0" width="100" height="50" rx="4" ry="4"/></clipPath>'
    )
    expect(svg).toContain('<g clip-path="url(#clip-card)">')
    expect(svg.indexOf('#111111')).toBeLessThan(svg.indexOf('#222222'))
  })

  it('skips hidden nodes and their children', () => {
    const document = build([
      { kind: 'create', id: 'g', type: 'group', parentId: 'page', properties: { visible: false } },
      {
        kind: 'create',
        id: 'inner',
        type: 'rectangle',
        parentId: 'g',
        properties: { fill: '#abcdef' }
      }
    ])
    expect(exportNodeToSvg(document, 'page')).not.toContain('#abcdef')
  })

  it('renders text with font settings and escapes markup', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: {
          x: 5,
          y: 7,
          width: 100,
          height: 20,
          text: 'A < B & "C"',
          fontSize: 14,
          fontFamily: 'Inter, "Helvetica Neue", sans-serif',
          fill: '#333333'
        }
      }
    ])
    expect(exportNodeToSvg(document, 'label')).toContain(
      '<text x="5" y="7" font-family="Inter, &quot;Helvetica Neue&quot;, sans-serif" font-size="14" dominant-baseline="hanging" fill="#333333">A &lt; B &amp; &quot;C&quot;</text>'
    )
  })

  it('splits multi-line text into tspans', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { text: 'one\ntwo', fontSize: 10 }
      }
    ])
    const svg = exportNodeToSvg(document, 'label')
    expect(svg).toContain('<tspan x="0" dy="0">one</tspan>')
    expect(svg).toContain('<tspan x="0" dy="12">two</tspan>')
  })

  it('exports a page as the bounds of its content and rejects unknown nodes', () => {
    const document = build([
      {
        kind: 'create',
        id: 'a',
        type: 'rectangle',
        parentId: 'page',
        properties: { x: 10, y: 10, width: 10, height: 10 }
      },
      {
        kind: 'create',
        id: 'b',
        type: 'rectangle',
        parentId: 'page',
        properties: { x: 50, y: 30, width: 10, height: 10 }
      }
    ])
    expect(exportNodeToSvg(document, 'page')).toContain('viewBox="10 10 50 30"')
    expect(() => exportNodeToSvg(document, 'missing')).toThrow('Node missing does not exist')
  })

  it('exports an empty page as a 1x1 canvas instead of an invalid svg', () => {
    expect(exportNodeToSvg(build([]), 'page')).toContain('viewBox="0 0 1 1"')
  })
})
