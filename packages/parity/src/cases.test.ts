import { BLEND_MODES } from '@designo/core'
import { describe, expect, it } from 'vitest'
import { createParityCases } from './cases.ts'

const cases = createParityCases()
const nodesOf = (name: string) =>
  Object.values(cases.find((parityCase) => parityCase.name === name)?.document.nodes ?? {})

describe('createParityCases', () => {
  it('gives every case a unique name and a frame to draw', () => {
    expect(new Set(cases.map((parityCase) => parityCase.name)).size).toBe(cases.length)
    cases.forEach((parityCase) =>
      expect(parityCase.document.nodes[parityCase.frameId]?.type).toBe('frame')
    )
  })

  it('covers each effect a renderer draws', () => {
    expect(nodesOf('blur').some((node) => node.blur > 0)).toBe(true)
    expect(nodesOf('shadow').some((node) => node.shadow !== null)).toBe(true)
    expect(nodesOf('gradient-linear').some((node) => node.gradient?.kind === 'linear')).toBe(true)
    expect(nodesOf('gradient-radial').some((node) => node.gradient?.kind === 'radial')).toBe(true)
    expect(nodesOf('opacity').some((node) => node.opacity < 1)).toBe(true)
  })

  it('has a case for every blend mode', () => {
    const blended = new Set(
      cases.flatMap((parityCase) => parityCase.document.nodes.blended?.blendMode ?? [])
    )
    expect([...blended].toSorted()).toEqual(
      BLEND_MODES.filter((mode) => mode !== 'normal').toSorted()
    )
  })
})
