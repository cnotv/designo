import { describe, expect, it } from 'vitest'
import { createShelfPacker, packRectangle, SHELF_HEIGHT_STEP } from './shelfPacker.ts'
import type { AtlasRectangle, ShelfPackerState } from '@designo/text'

const packAll = (state: ShelfPackerState, sizes: readonly (readonly [number, number])[]) =>
  sizes.reduce<{ state: ShelfPackerState; rectangles: (AtlasRectangle | undefined)[] }>(
    (accumulated, [width, height]) => {
      const result = packRectangle(accumulated.state, width, height)
      return {
        state: result?.state ?? accumulated.state,
        rectangles: [...accumulated.rectangles, result?.rectangle]
      }
    },
    { state, rectangles: [] }
  )

const overlaps = (first: AtlasRectangle, second: AtlasRectangle): boolean =>
  first.x < second.x + second.width &&
  second.x < first.x + first.width &&
  first.y < second.y + second.height &&
  second.y < first.y + first.height

describe('shelf packer', () => {
  it('puts the first rectangle in the top left corner', () => {
    const result = packRectangle(createShelfPacker(64, 64), 10, 8)
    expect(result?.rectangle).toEqual({ x: 0, y: 0, width: 10, height: 8 })
  })

  it('packs the next rectangle beside it on the same shelf', () => {
    const { rectangles } = packAll(createShelfPacker(64, 64), [
      [10, 8],
      [12, 8]
    ])
    expect(rectangles[1]).toEqual({ x: 10, y: 0, width: 12, height: 8 })
  })

  it('opens a new shelf below when the row is full', () => {
    const { rectangles } = packAll(createShelfPacker(20, 64), [
      [12, 8],
      [12, 8]
    ])
    expect(rectangles[1]?.x).toBe(0)
    expect(rectangles[1]?.y).toBeGreaterThanOrEqual(8)
  })

  it('rounds a shelf up to a step so rectangles a texel taller can still share it', () => {
    const { rectangles } = packAll(createShelfPacker(64, 64), [
      [10, SHELF_HEIGHT_STEP * 2 - 1],
      [10, SHELF_HEIGHT_STEP * 2]
    ])
    expect(rectangles[1]).toMatchObject({ x: 10, y: 0 })
  })

  it('puts a rectangle on the snuggest shelf that is tall enough', () => {
    const tall = SHELF_HEIGHT_STEP * 8
    const short = SHELF_HEIGHT_STEP * 2
    // Two shelves, tall then short; the next short rectangle should go on the short one.
    const { state } = packAll(createShelfPacker(20, 256), [
      [20, tall],
      [10, short]
    ])
    const result = packRectangle(state, 10, short)
    expect(result?.rectangle).toMatchObject({ x: 10, y: tall })
  })

  it('does not reuse a shelf that is too short', () => {
    const short = SHELF_HEIGHT_STEP
    const { rectangles } = packAll(createShelfPacker(64, 256), [
      [10, short],
      [10, short * 3]
    ])
    expect(rectangles[1]).toMatchObject({ x: 0 })
    expect(rectangles[1]?.y).toBeGreaterThanOrEqual(short)
  })

  it('says so when no room is left, and leaves the state alone', () => {
    const full = packRectangle(createShelfPacker(16, 16), 16, 16)
    expect(full).toBeDefined()
    expect(packRectangle(full?.state ?? createShelfPacker(16, 16), 1, 1)).toBeUndefined()
  })

  it('refuses a rectangle larger than the page', () => {
    expect(packRectangle(createShelfPacker(32, 32), 33, 4)).toBeUndefined()
    expect(packRectangle(createShelfPacker(32, 32), 4, 33)).toBeUndefined()
  })

  it('fits a last shelf into the page height even when rounding would overshoot', () => {
    const result = packRectangle(createShelfPacker(16, 6), 4, 5)
    expect(result?.rectangle).toEqual({ x: 0, y: 0, width: 4, height: 5 })
  })

  it('does not change the state it is given', () => {
    const state = createShelfPacker(64, 64)
    packRectangle(state, 10, 10)
    expect(state).toEqual(createShelfPacker(64, 64))
  })

  it('never overlaps rectangles or leaves the page, however they are sized', () => {
    // A fixed pseudo-random sequence of glyph-like sizes.
    const sizes = Array.from(
      { length: 300 },
      (_, index) => [4 + ((index * 37) % 23), 5 + ((index * 53) % 29)] as const
    )
    const { rectangles } = packAll(createShelfPacker(128, 128), sizes)
    const placed = rectangles.filter((rectangle): rectangle is AtlasRectangle => !!rectangle)
    expect(placed.length).toBeGreaterThan(20)
    expect(
      placed.every(
        (rectangle) =>
          rectangle.x >= 0 &&
          rectangle.y >= 0 &&
          rectangle.x + rectangle.width <= 128 &&
          rectangle.y + rectangle.height <= 128
      )
    ).toBe(true)
    const anyOverlap = placed.some((first, index) =>
      placed.slice(index + 1).some((second) => overlaps(first, second))
    )
    expect(anyOverlap).toBe(false)
  })
})
