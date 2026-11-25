import { describe, expect, it } from 'vitest'
import { getImagePlacement } from './imageFit.ts'

const box = { width: 200, height: 100 }
const wide = { width: 400, height: 100 }

describe('getImagePlacement', () => {
  it('stretches the picture over the whole box', () => {
    expect(getImagePlacement(box, wide, 'stretch')).toEqual({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('fits the whole picture inside the box, centred', () => {
    expect(getImagePlacement(box, wide, 'fit')).toEqual({ x: 0, y: 25, width: 200, height: 50 })
  })

  it('fills the box and lets the picture overflow it, centred', () => {
    expect(getImagePlacement(box, wide, 'fill')).toEqual({ x: -100, y: 0, width: 400, height: 100 })
  })

  it('stretches a picture with no size', () => {
    expect(getImagePlacement(box, { width: 0, height: 0 }, 'fit')).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100
    })
  })
})
