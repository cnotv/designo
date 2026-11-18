import { Resvg } from '@resvg/resvg-js'
import { applyOperations, createDocument } from '@designo/core'
import { exportNodeToSvg } from '@designo/exporter'
import { describe, expect, it } from 'vitest'

const FONT_SIZE = 30
const LINE_HEIGHT = FONT_SIZE * 1.2
const DARK_CHANNEL_LIMIT = 128
const CHANNELS_PER_PIXEL = 4

const drawText = (text: string): string => {
  const result = applyOperations(createDocument('file', 'Text', 'page'), [
    {
      kind: 'create',
      id: 'sheet',
      type: 'frame',
      parentId: 'page',
      properties: { width: 200, height: 200, fill: '#ffffff' }
    },
    {
      kind: 'create',
      id: 'words',
      type: 'text',
      parentId: 'sheet',
      properties: {
        x: 10,
        y: 10,
        fontSize: FONT_SIZE,
        fontFamily: 'DejaVu Sans',
        fill: '#000000',
        text
      }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  return exportNodeToSvg(result.document, 'sheet')
}

/** The top row of every run of rows that holds dark pixels: one entry per drawn line of text. */
const inkRowTops = (svg: string): number[] => {
  const image = new Resvg(svg, { font: { loadSystemFonts: true } }).render()
  const pixels = image.pixels
  const rowHasInk = Array.from({ length: image.height }, (_, row) =>
    Array.from({ length: image.width }).some(
      (_unused, column) =>
        (pixels[(row * image.width + column) * CHANNELS_PER_PIXEL] ?? 255) < DARK_CHANNEL_LIMIT
    )
  )
  return rowHasInk.flatMap((hasInk, row) => (hasInk && !rowHasInk[row - 1] ? [row] : []))
}

describe('multi-line text, drawn', () => {
  it('draws lines one line height apart', () => {
    const [first, second] = inkRowTops(drawText('H\nH'))
    expect((second ?? 0) - (first ?? 0)).toBeCloseTo(LINE_HEIGHT, 0)
  })

  it('keeps the gap of a blank line between two paragraphs', () => {
    const tops = inkRowTops(drawText('H\n\nH'))
    expect(tops).toHaveLength(2)
    expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeCloseTo(LINE_HEIGHT * 2, 0)
  })

  it('keeps several blank lines and a leading one', () => {
    const [first] = inkRowTops(drawText('H'))
    const tops = inkRowTops(drawText('\nH\n\n\nH'))
    expect((tops[0] ?? 0) - (first ?? 0)).toBeCloseTo(LINE_HEIGHT, 0)
    expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeCloseTo(LINE_HEIGHT * 3, 0)
  })

  it('still draws text that holds characters XML forbids', () => {
    expect(inkRowTops(drawText('H\u0001'))).toHaveLength(1)
  })
})
