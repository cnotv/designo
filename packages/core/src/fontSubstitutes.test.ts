import { describe, expect, it } from 'vitest'
import { withFontSubstitutes } from './fontSubstitutes.ts'

describe('withFontSubstitutes', () => {
  it('puts the stand-in right after the font it replaces', () => {
    expect(withFontSubstitutes('Georgia, serif')).toBe('Georgia, Gelasio, serif')
  })

  it('reads a quoted name in any case', () => {
    expect(withFontSubstitutes(`'georgia'`)).toBe(`'georgia', Gelasio`)
  })

  it('leaves a list alone when it already names the stand-in', () => {
    expect(withFontSubstitutes('Georgia, Gelasio, serif')).toBe('Georgia, Gelasio, serif')
  })

  it('leaves a list alone when no font in it has a stand-in', () => {
    expect(withFontSubstitutes('Inter, system-ui, sans-serif')).toBe('Inter, system-ui, sans-serif')
  })
})
