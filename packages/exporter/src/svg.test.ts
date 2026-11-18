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

  it('leaves out a child that lies wholly outside its frame, because the clip hides it anyway', () => {
    const document = build([
      {
        kind: 'create',
        id: 'card',
        type: 'frame',
        parentId: 'page',
        properties: { x: 100, y: 8400, width: 840, height: 420 }
      },
      {
        kind: 'create',
        id: 'inside',
        type: 'ellipse',
        parentId: 'card',
        properties: { x: 200, y: 8500, width: 50, height: 50, fill: '#111111' }
      },
      {
        kind: 'create',
        id: 'bleeding',
        type: 'ellipse',
        parentId: 'card',
        properties: { x: 900, y: 8500, width: 100, height: 50, fill: '#222222' }
      },
      {
        kind: 'create',
        id: 'far-right',
        type: 'ellipse',
        parentId: 'card',
        properties: { x: 14_000, y: 8500, width: 50, height: 50, fill: '#333333' }
      },
      {
        kind: 'create',
        id: 'far-below',
        type: 'rectangle',
        parentId: 'card',
        properties: { x: 200, y: 20_000, width: 50, height: 50, fill: '#444444' }
      }
    ])
    const svg = exportNodeToSvg(document, 'card')
    expect(svg).toContain('#111111')
    expect(svg).toContain('#222222')
    expect(svg).not.toContain('#333333')
    expect(svg).not.toContain('#444444')
  })

  it('keeps a text that starts left of its frame but runs into it', () => {
    const document = build([
      {
        kind: 'create',
        id: 'card',
        type: 'frame',
        parentId: 'page',
        properties: { x: 1000, y: 0, width: 300, height: 100 }
      },
      {
        kind: 'create',
        id: 'headline',
        type: 'text',
        parentId: 'card',
        properties: { x: 900, y: 10, width: 10, height: 10, fontSize: 20, text: 'A'.repeat(20) }
      }
    ])
    expect(exportNodeToSvg(document, 'card')).toContain('AAAAAAAAAAAAAAAAAAAA')
  })

  it('judges a nested frame child against every clip above it and the exported bounds', () => {
    const document = build([
      {
        kind: 'create',
        id: 'outer',
        type: 'frame',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 300, height: 200 }
      },
      {
        kind: 'create',
        id: 'inner',
        type: 'frame',
        parentId: 'outer',
        properties: { x: 0, y: 0, width: 5000, height: 5000 }
      },
      {
        kind: 'create',
        id: 'near',
        type: 'rectangle',
        parentId: 'inner',
        properties: { x: 10, y: 10, width: 20, height: 20, fill: '#aaaaaa' }
      },
      {
        kind: 'create',
        id: 'far',
        type: 'rectangle',
        parentId: 'inner',
        properties: { x: 3000, y: 3000, width: 20, height: 20, fill: '#bbbbbb' }
      }
    ])
    const svg = exportNodeToSvg(document, 'outer')
    expect(svg).toContain('#aaaaaa')
    expect(svg).not.toContain('#bbbbbb')
  })

  it('leaves out a child of a group that lies outside the exported bounds', () => {
    const document = build([
      {
        kind: 'create',
        id: 'cluster',
        type: 'group',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 100, height: 100, opacity: 0.5 }
      },
      {
        kind: 'create',
        id: 'near',
        type: 'rectangle',
        parentId: 'cluster',
        properties: { x: 10, y: 10, width: 20, height: 20, fill: '#aaaaaa' }
      },
      {
        kind: 'create',
        id: 'far',
        type: 'rectangle',
        parentId: 'cluster',
        properties: { x: 5000, y: 10, width: 20, height: 20, fill: '#bbbbbb' }
      }
    ])
    const svg = exportNodeToSvg(document, 'cluster')
    expect(svg).toContain('#aaaaaa')
    expect(svg).not.toContain('#bbbbbb')
  })

  it('judges children of a rotated frame in the frame own space', () => {
    const document = build([
      {
        kind: 'create',
        id: 'tilted',
        type: 'frame',
        parentId: 'page',
        properties: { x: 0, y: 0, width: 400, height: 100, rotation: 90 }
      },
      {
        kind: 'create',
        id: 'at-the-end',
        type: 'rectangle',
        parentId: 'tilted',
        properties: { x: 380, y: 40, width: 20, height: 20, fill: '#cccccc' }
      }
    ])
    expect(exportNodeToSvg(document, 'tilted')).toContain('#cccccc')
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
      '<text x="5" y="7" font-family="Inter, &quot;Helvetica Neue&quot;, Arimo, sans-serif" font-size="14" dominant-baseline="hanging" fill="#333333">A &lt; B &amp; &quot;C&quot;</text>'
    )
  })

  it('lists the bundled stand-in after Georgia, so a renderer without Georgia still breaks lines alike', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { text: 'Once', fontFamily: 'Georgia, serif' }
      }
    ])
    expect(exportNodeToSvg(document, 'label')).toContain('font-family="Georgia, Gelasio, serif"')
  })

  it('puts each line on its alphabetic baseline when the font metrics are known', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { x: 0, y: 10, text: 'one\ntwo', fontSize: 20, lineHeight: 1.5 }
      }
    ])
    const svg = exportNodeToSvg(document, 'label', {
      getFontMetrics: () => ({ unitsPerEm: 1000, ascender: 800, descender: -200 })
    })
    expect(svg).not.toContain('dominant-baseline')
    expect(svg).toContain('<tspan x="0" y="31">one</tspan><tspan x="0" y="61">two</tspan>')
  })

  it('names the family the caller resolves the list to', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { text: 'Once', fontFamily: 'Georgia' }
      }
    ])
    const svg = exportNodeToSvg(document, 'label', { resolveFontFamily: () => 'designo-1234' })
    expect(svg).toContain('font-family="designo-1234"')
  })

  it('splits multi-line text into tspans placed by absolute y, one line height apart', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { y: 5, text: 'one\ntwo', fontSize: 10 }
      }
    ])
    const svg = exportNodeToSvg(document, 'label')
    expect(svg).toContain('<tspan x="0" y="5">one</tspan>')
    expect(svg).toContain('<tspan x="0" y="17">two</tspan>')
  })

  // An empty tspan contributes nothing, so a line gap carried by its dy is lost: the line after
  // a blank line must say where it is itself.
  it('keeps a blank line by placing the line after it two line heights down', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { text: 'one\n\nthree', fontSize: 10 }
      }
    ])
    const svg = exportNodeToSvg(document, 'label')
    expect(svg).toContain('<tspan x="0" y="0">one</tspan>')
    expect(svg).toContain('<tspan x="0" y="24">three</tspan>')
    expect(svg).not.toContain('<tspan x="0" y="12">')
  })

  it('keeps a leading blank line', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { text: '\nlate', fontSize: 10 }
      }
    ])
    expect(exportNodeToSvg(document, 'label')).toContain('<tspan x="0" y="12">late</tspan>')
  })

  it('drops characters XML cannot hold, which would make the whole SVG unreadable', () => {
    const document = build([
      {
        kind: 'create',
        id: 'label',
        type: 'text',
        parentId: 'page',
        properties: { text: 'a\u0001b\u000bc\ufffed', name: 'x\u0000y' }
      }
    ])
    expect(exportNodeToSvg(document, 'label')).toContain('>abcd</text>')
  })

  describe('text alignment and line height', () => {
    const buildText = (properties: Record<string, unknown>): string =>
      exportNodeToSvg(
        build([
          {
            kind: 'create',
            id: 'label',
            type: 'text',
            parentId: 'page',
            properties: { x: 10, y: 20, width: 100, height: 40, fontSize: 10, ...properties }
          }
        ]),
        'label'
      )

    it('draws a text node with the defaults exactly as before the properties existed', () => {
      expect(buildText({ text: 'one', textAlign: 'left', lineHeight: 1.2 })).toBe(
        buildText({ text: 'one' })
      )
      expect(buildText({ text: 'one\ntwo' })).toContain('<tspan x="10" y="32">two</tspan>')
      expect(buildText({ text: 'one' })).not.toContain('text-anchor')
    })

    it('centres each line on the middle of the node width', () => {
      const svg = buildText({ text: 'one\ntwo', textAlign: 'center' })
      expect(svg).toContain('x="60" y="20" font-family')
      expect(svg).toContain('text-anchor="middle"')
      expect(svg).toContain('<tspan x="60" y="20">one</tspan>')
      expect(svg).toContain('<tspan x="60" y="32">two</tspan>')
    })

    it('puts each line against the right edge of the node width', () => {
      const svg = buildText({ text: 'one\ntwo', textAlign: 'right' })
      expect(svg).toContain('x="110" y="20" font-family')
      expect(svg).toContain('text-anchor="end"')
      expect(svg).toContain('<tspan x="110" y="32">two</tspan>')
    })

    it('spaces lines by the line height times the font size', () => {
      const svg = buildText({ text: 'one\ntwo\nthree', lineHeight: 2 })
      // The first line sits 4 lower (half of the extra leading), then each line is 20 further down.
      expect(svg).toContain('<tspan x="10" y="44">two</tspan>')
      expect(svg).toContain('<tspan x="10" y="64">three</tspan>')
    })

    it('keeps a blank line as a gap whatever the line height', () => {
      const svg = buildText({ text: 'one\n\nthree', lineHeight: 2 })
      expect(svg).toContain('<tspan x="10" y="24">one</tspan>')
      expect(svg).toContain('<tspan x="10" y="64">three</tspan>')
      expect(svg).not.toContain('<tspan x="10" y="44">')
    })

    it('moves the first line down by half of the extra leading, as the editor does', () => {
      expect(buildText({ text: 'one', lineHeight: 2 })).toContain('x="10" y="24" font-family')
      expect(buildText({ text: 'one', lineHeight: 1 })).toContain('x="10" y="19" font-family')
    })

    it('does not wrap: a fixed-width node is drawn line by line as written', () => {
      const svg = buildText({ text: 'a long line of words', textWrap: true, width: 20 })
      expect(svg).toContain('>a long line of words</text>')
    })
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
