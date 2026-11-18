import { createShelfPacker, packRectangle } from './shelfPacker.ts'
import type { AtlasPagePool, PagePlacement, ShelfPackerState } from './types.ts'

interface AtlasPage {
  packer: ShelfPackerState
  glyphIds: Set<string>
  lastUsedFrame: number
}

interface PageSettings {
  pageWidth: number
  pageHeight: number
  maxPages: number
}

/**
 * Keeps the atlas's pages. It grows to `maxPages`, and after that clears the page that has gone
 * longest without a lookup. Shelf packing cannot free a single rectangle without fragmenting the
 * page, so a whole page goes at once, and its glyphs are drawn again when next asked for. Pages
 * used since `beginFrame` are never cleared, so a frame cannot lose a glyph it already placed.
 * @param settings - The page size and the most pages.
 * @returns The pool.
 */
export const createAtlasPagePool = ({
  pageWidth,
  pageHeight,
  maxPages
}: PageSettings): AtlasPagePool => {
  const pages: AtlasPage[] = []
  const state = { frame: 0 }

  const tryPack = (
    pageIndex: number,
    width: number,
    height: number
  ): Pick<PagePlacement, 'pageIndex' | 'rectangle'> | undefined => {
    const page = pages[pageIndex] as AtlasPage
    const result = packRectangle(page.packer, width, height)
    if (!result) return undefined
    page.packer = result.state
    page.lastUsedFrame = state.frame
    return { pageIndex, rectangle: result.rectangle }
  }

  const findEvictablePage = (): number | undefined =>
    pages
      .map((page, index) => ({ index, lastUsedFrame: page.lastUsedFrame }))
      .filter(({ lastUsedFrame }) => lastUsedFrame < state.frame)
      .reduce<{ index: number; lastUsedFrame: number } | undefined>(
        (oldest, candidate) =>
          oldest === undefined || candidate.lastUsedFrame < oldest.lastUsedFrame
            ? candidate
            : oldest,
        undefined
      )?.index

  const packOnExistingPage = (width: number, height: number) =>
    pages
      .map((_, index) => index)
      .reduce<ReturnType<typeof tryPack>>(
        (found, index) => found ?? tryPack(index, width, height),
        undefined
      )

  const packOnNewPage = (width: number, height: number) => {
    if (pages.length >= maxPages) return undefined
    pages.push({
      packer: createShelfPacker(pageWidth, pageHeight),
      glyphIds: new Set(),
      lastUsedFrame: state.frame
    })
    return tryPack(pages.length - 1, width, height)
  }

  const packAfterEviction = (width: number, height: number): PagePlacement | undefined => {
    const pageIndex = findEvictablePage()
    if (pageIndex === undefined) return undefined
    const page = pages[pageIndex] as AtlasPage
    const glyphIds = [...page.glyphIds]
    page.glyphIds.clear()
    page.packer = createShelfPacker(pageWidth, pageHeight)
    const placement = tryPack(pageIndex, width, height)
    return placement && { ...placement, evicted: { pageIndex, glyphIds } }
  }

  return {
    beginFrame: () => {
      state.frame += 1
    },
    place: (width, height) => {
      // Larger than an empty page: no amount of growing or evicting would help.
      if (width > pageWidth || height > pageHeight) return undefined
      const placement = packOnExistingPage(width, height) ?? packOnNewPage(width, height)
      return placement ? { ...placement, evicted: undefined } : packAfterEviction(width, height)
    },
    markUsed: (pageIndex) => {
      const page = pages[pageIndex]
      if (page) page.lastUsedFrame = state.frame
    },
    addGlyph: (pageIndex, glyphId) => {
      pages[pageIndex]?.glyphIds.add(glyphId)
    },
    getPageCount: () => pages.length
  }
}
