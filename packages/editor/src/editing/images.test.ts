import { describe, expect, it } from 'vitest'
import { createImageInsertOperation, fitImageSize, isPictureType, readImageFit } from './images.ts'

describe('fitImageSize', () => {
  it('keeps a picture that already fits', () => {
    expect(fitImageSize({ width: 200, height: 100 }, 400)).toEqual({ width: 200, height: 100 })
  })

  it('shrinks the longer side to the limit and keeps the proportions', () => {
    expect(fitImageSize({ width: 2000, height: 1000 }, 400)).toEqual({ width: 400, height: 200 })
    expect(fitImageSize({ width: 1000, height: 4000 }, 400)).toEqual({ width: 100, height: 400 })
  })

  it('never gives a side less than one unit', () => {
    expect(fitImageSize({ width: 10_000, height: 1 }, 400)).toEqual({ width: 400, height: 1 })
  })
})

describe('createImageInsertOperation', () => {
  const operation = createImageInsertOperation({
    nodeId: 'image-1',
    parentId: 'page-1',
    assetId: `${'a'.repeat(64)}.png`,
    size: { width: 200, height: 100 },
    center: { x: 500, y: 300 }
  })

  it('creates an image node under the parent, with the picture', () => {
    expect(operation).toMatchObject({
      kind: 'create',
      id: 'image-1',
      type: 'image',
      parentId: 'page-1',
      properties: { imageAsset: `${'a'.repeat(64)}.png`, name: 'Image' }
    })
  })

  it('centres the picture on the point', () => {
    expect(operation).toMatchObject({
      properties: { x: 400, y: 250, width: 200, height: 100 }
    })
  })
})

describe('readImageFit', () => {
  it('reads the three fits and nothing else', () => {
    expect(readImageFit('fill')).toBe('fill')
    expect(readImageFit('cover')).toBeUndefined()
  })
})

describe('isPictureType', () => {
  it('accepts the picture types the store keeps', () => {
    expect(isPictureType('image/webp')).toBe(true)
    expect(isPictureType('image/svg+xml')).toBe(false)
  })
})
