import { describe, expect, it, vi } from 'vitest'
import type { TextBoxRequest } from '../../editing/types.ts'
import { createTextBoxMeasurer } from './textBoxMeasurer.ts'
import type { TextLayout } from '@designo/text'

const request: TextBoxRequest = {
  text: 'Hello',
  fontFamily: 'Inter',
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: 0,
  fontSize: 16,
  lineHeight: 1.2,
  textAlign: 'center',
  wrapWidth: 120
}

const layout: TextLayout = { lines: [], width: 120, height: 57.6, lineHeight: 19.2 }

describe('createTextBoxMeasurer', () => {
  it('sizes a box by the shaped layout of the same request the canvas draws', () => {
    const getLayout = vi.fn(() => layout)
    const measure = createTextBoxMeasurer({ getLayout }, () => undefined)
    expect(measure(request)).toEqual({ width: 120, height: 57.6 })
    expect(getLayout).toHaveBeenCalledWith({
      text: 'Hello',
      fontFamily: 'Inter',
      fontWeight: 400,
      fontStyle: 'normal',
      letterSpacing: 0,
      fontSize: 16,
      lineHeight: 1.2,
      alignment: 'center',
      wrapWidth: 120
    })
  })

  it('asks the browser to measure while the layout is not ready', () => {
    const measureFallback = vi.fn(() => ({ width: 33, height: 20 }))
    const measure = createTextBoxMeasurer({ getLayout: () => undefined }, measureFallback)
    expect(measure(request)).toEqual({ width: 33, height: 20 })
    expect(measureFallback).toHaveBeenCalled()
  })

  it('estimates where nothing can measure', () => {
    const measure = createTextBoxMeasurer({ getLayout: () => undefined }, () => undefined)
    const size = measure({ ...request, wrapWidth: undefined })
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBe(Math.ceil(16 * 1.2))
  })
})
