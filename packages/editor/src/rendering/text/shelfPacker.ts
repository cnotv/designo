import type { PackResult, Shelf, ShelfPackerState } from '@designo/text'

/** Shelf heights are rounded up to this, so glyphs a texel taller than the first one still fit. */
export const SHELF_HEIGHT_STEP = 4

/**
 * Starts an empty page.
 * @param pageWidth - The page's width in texels.
 * @param pageHeight - The page's height in texels.
 * @returns A packer with nothing placed.
 */
export const createShelfPacker = (pageWidth: number, pageHeight: number): ShelfPackerState => ({
  pageWidth,
  pageHeight,
  shelves: [],
  nextShelfY: 0
})

const roundUpToStep = (height: number): number =>
  Math.ceil(height / SHELF_HEIGHT_STEP) * SHELF_HEIGHT_STEP

const findSnuggestShelf = (
  state: ShelfPackerState,
  width: number,
  height: number
): number | undefined => {
  const candidates = state.shelves
    .map((shelf, index) => ({ shelf, index }))
    .filter(({ shelf }) => shelf.height >= height && shelf.usedWidth + width <= state.pageWidth)
  return candidates.reduce<{ index: number; waste: number } | undefined>(
    (best, { shelf, index }) =>
      best === undefined || shelf.height - height < best.waste
        ? { index, waste: shelf.height - height }
        : best,
    undefined
  )?.index
}

const placeOnShelf = (
  state: ShelfPackerState,
  shelfIndex: number,
  width: number,
  height: number
): PackResult => {
  const shelf = state.shelves[shelfIndex] as Shelf
  return {
    state: {
      ...state,
      shelves: state.shelves.map((existing, index) =>
        index === shelfIndex ? { ...existing, usedWidth: existing.usedWidth + width } : existing
      )
    },
    rectangle: { x: shelf.usedWidth, y: shelf.y, width, height }
  }
}

const placeOnNewShelf = (
  state: ShelfPackerState,
  width: number,
  height: number
): PackResult | undefined => {
  const room = state.pageHeight - state.nextShelfY
  if (height > room) return undefined
  // Rounded up for reuse, but never past the page.
  const shelfHeight = Math.min(roundUpToStep(height), room)
  return {
    state: {
      ...state,
      shelves: [...state.shelves, { y: state.nextShelfY, height: shelfHeight, usedWidth: width }],
      nextShelfY: state.nextShelfY + shelfHeight
    },
    rectangle: { x: 0, y: state.nextShelfY, width, height }
  }
}

/**
 * Places a rectangle on a page with the shelf algorithm: rectangles go left to right along
 * shelves, on the snuggest shelf tall enough, and a new shelf opens below when none has room.
 * Pure: the state is not changed, the new one comes back.
 * @param state - The page so far.
 * @param width - The rectangle's width in texels.
 * @param height - The rectangle's height in texels.
 * @returns Where it went and the page after; undefined when it does not fit.
 */
export const packRectangle = (
  state: ShelfPackerState,
  width: number,
  height: number
): PackResult | undefined => {
  if (width > state.pageWidth || height > state.pageHeight) return undefined
  const shelfIndex = findSnuggestShelf(state, width, height)
  return shelfIndex === undefined
    ? placeOnNewShelf(state, width, height)
    : placeOnShelf(state, shelfIndex, width, height)
}
