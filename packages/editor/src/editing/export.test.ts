import { applyOperations, createDocument, type OperationResult } from '@designo/core'
import { describe, expect, it } from 'vitest'
import {
  buildExportFileName,
  clampExportScale,
  getExportTargetIds,
  getRasterSize,
  MAX_RASTER_SIDE,
  sanitizeFileName
} from './export.ts'

const unwrap = (result: OperationResult) => {
  if (!result.ok) throw new Error(result.error)
  return result.document
}

describe('sanitizeFileName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeFileName('Hero card')).toBe('Hero card')
  })

  it('replaces path separators and reserved characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
  })

  it('trims edge dots and spaces so the file is not hidden', () => {
    expect(sanitizeFileName('  ..name.. ')).toBe('name')
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFileName('...')).toBe('export')
    expect(sanitizeFileName('')).toBe('export')
  })
})

describe('clampExportScale', () => {
  it('keeps the offered scales', () => {
    expect([1, 2, 3].map(clampExportScale)).toEqual([1, 2, 3])
  })

  it('clamps and rounds anything else', () => {
    expect(clampExportScale(0)).toBe(1)
    expect(clampExportScale(10)).toBe(3)
    expect(clampExportScale(1.6)).toBe(2)
    expect(clampExportScale(Number.NaN)).toBe(1)
  })
})

describe('buildExportFileName', () => {
  it('names an SVG after the layer', () => {
    expect(buildExportFileName('Card', 'svg', 3)).toBe('Card.svg')
  })

  it('adds the scale to a PNG', () => {
    expect(buildExportFileName('Card', 'png', 2)).toBe('Card@2x.png')
  })

  it('sanitises the layer name', () => {
    expect(buildExportFileName('a/b', 'png', 1)).toBe('a-b@1x.png')
  })
})

describe('getExportTargetIds', () => {
  const document = unwrap(
    applyOperations(createDocument('doc', 'Doc', 'page'), [
      { kind: 'create', id: 'frame', type: 'frame', parentId: 'page' }
    ])
  )

  it('exports the selection', () => {
    expect(getExportTargetIds(document, ['frame'])).toEqual(['frame'])
  })

  it('exports the page when nothing is selected', () => {
    expect(getExportTargetIds(document, [])).toEqual(['page'])
  })

  it('ignores ids that no longer exist', () => {
    expect(getExportTargetIds(document, ['gone'])).toEqual(['page'])
  })
})

describe('getRasterSize', () => {
  it('multiplies by the scale', () => {
    expect(getRasterSize({ width: 100, height: 50.4 }, 2)).toEqual({ width: 200, height: 101 })
  })

  it('never goes below one pixel', () => {
    expect(getRasterSize({ width: 0.1, height: 0.1 }, 1)).toEqual({ width: 1, height: 1 })
  })

  it('shrinks to the canvas limit', () => {
    const size = getRasterSize({ width: 6000, height: 3000 }, 3)
    expect(size.width).toBe(MAX_RASTER_SIDE)
    expect(size.height).toBe(MAX_RASTER_SIDE / 2)
  })
})
