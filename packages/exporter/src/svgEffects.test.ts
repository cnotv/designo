import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignNodePatch
} from '@designo/core'
import { exportNodeToSvg } from './svg.ts'

const STOPS = [
  { offset: 0, color: '#ff0000' },
  { offset: 1, color: '#0000ff' }
]

const exportWith = (
  patch: DesignNodePatch,
  type: 'rectangle' | 'ellipse' | 'frame' = 'rectangle'
): string => {
  const result = applyOperations(createDocument('file', 'Test', 'page'), [
    {
      kind: 'create',
      id: 'n',
      type,
      parentId: 'page',
      properties: { x: 10, y: 20, width: 100, height: 50, ...patch }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  const document: DesignDocument = result.document
  return exportNodeToSvg(document, 'page')
}

describe('gradients', () => {
  it('fills a rectangle with a linear gradient along its angle', () => {
    const svg = exportWith({ gradient: { kind: 'linear', angle: 0, stops: STOPS } })
    expect(svg).toContain(
      '<linearGradient id="gradient-n" gradientUnits="userSpaceOnUse" x1="10" y1="45" x2="110" y2="45">'
    )
    expect(svg).toContain('<stop offset="0" stop-color="#ff0000"/>')
    expect(svg).toContain('fill="url(#gradient-n)"')
  })

  it('fills an ellipse with a radial gradient', () => {
    const svg = exportWith({ gradient: { kind: 'radial', angle: 0, stops: STOPS } }, 'ellipse')
    expect(svg).toContain('<radialGradient id="gradient-n" cx="0.5" cy="0.5" r="0.5">')
    expect(svg).toContain('<ellipse')
  })

  it('paints a frame background with its gradient', () => {
    const svg = exportWith({ gradient: { kind: 'linear', angle: 90, stops: STOPS } }, 'frame')
    expect(svg).toContain('fill="url(#gradient-n)"')
  })
})

describe('blur', () => {
  it('blurs a shape through a filter that reaches three deviations past it', () => {
    const svg = exportWith({ blur: 4 })
    expect(svg).toContain(
      '<filter id="effects-n" filterUnits="userSpaceOnUse" x="-2" y="8" width="124" height="74">'
    )
    expect(svg).toContain('<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="body"/>')
    expect(svg).toContain('filter="url(#effects-n)"')
  })

  it('writes no filter for a sharp shape', () => {
    expect(exportWith({})).not.toContain('filter')
  })
})

describe('shadow', () => {
  it('casts a shadow from the sharp shape, moved and tinted, under the body', () => {
    const svg = exportWith({ shadow: { x: 6, y: 8, blur: 3, color: '#00000080' } })
    expect(svg).toContain('<feOffset in="softened" dx="6" dy="8" result="moved"/>')
    expect(svg).toContain('<feFlood flood-color="#00000080"/>')
    expect(svg).toContain('<feMerge><feMergeNode in="shadow"/><feMergeNode in="body"/></feMerge>')
  })
})

describe('blend mode', () => {
  it('sets mix-blend-mode on a shape', () => {
    expect(exportWith({ blendMode: 'multiply' })).toContain('style="mix-blend-mode:multiply"')
  })

  it('writes nothing for normal blending', () => {
    expect(exportWith({ blendMode: 'normal' })).not.toContain('mix-blend-mode')
  })
})

describe('export bounds', () => {
  it('grow to hold a blur', () => {
    const svg = exportWith({ blur: 10 })
    expect(svg).toContain('viewBox="-20 -10 160 110"')
  })
})
