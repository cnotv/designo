import type {
  DesignNode,
  PageFacing,
  PageGuides,
  PageMargins,
  PageSetupInput,
  PageSetupPatch,
  PageUnit
} from './types.ts'

const POINTS_PER_INCH = 72
const MILLIMETRES_PER_INCH = 25.4

/** A rectangle in the frame's own space, whose origin is the top left corner of its trim box. */
export interface GuideRectangle {
  x: number
  y: number
  width: number
  height: number
}

/** Everything a frame's page setup draws as guides, in the frame's own space. */
export interface PageGuideGeometry {
  trim: GuideRectangle
  /** The trim box grown by the bleed; undefined with no bleed. */
  bleed: GuideRectangle | undefined
  /** One margin box for each page the frame holds. */
  margins: readonly GuideRectangle[]
  /** The columns of every margin box, left to right; empty for one column. */
  columns: readonly GuideRectangle[]
  /** The x of the fold; undefined when the frame has none. */
  fold: number | undefined
}

/**
 * Converts millimetres to points, the unit a design is drawn and exported in.
 * @param millimetres - A length in millimetres.
 * @returns The same length in points.
 */
export const millimetresToPoints = (millimetres: number): number =>
  (millimetres * POINTS_PER_INCH) / MILLIMETRES_PER_INCH

/**
 * Converts points to millimetres.
 * @param points - A length in points.
 * @returns The same length in millimetres.
 */
export const pointsToMillimetres = (points: number): number =>
  (points * MILLIMETRES_PER_INCH) / POINTS_PER_INCH

/**
 * Reads a length typed in a page's unit.
 * @param value - The length in `unit`.
 * @param unit - The unit it is written in.
 * @returns The length in points, which is what a frame stores.
 */
export const toPoints = (value: number, unit: PageUnit): number =>
  unit === 'mm' ? millimetresToPoints(value) : value

/**
 * Shows a stored length in a page's unit.
 * @param points - The length in points.
 * @param unit - The unit to show it in.
 * @returns The length in `unit`.
 */
export const fromPoints = (points: number, unit: PageUnit): number =>
  unit === 'mm' ? pointsToMillimetres(points) : points

type PageSide = 'left' | 'right'

// A page the frame holds: where it sits across the frame, and which edge is its spine.
interface PagePlacement {
  x: number
  width: number
  side: PageSide
}

const getPagePlacements = (node: DesignNode): readonly PagePlacement[] => {
  if (node.facing === 'spread') {
    const half = node.width / 2
    return [
      { x: 0, width: half, side: 'left' },
      { x: half, width: half, side: 'right' }
    ]
  }
  return [{ x: 0, width: node.width, side: node.facing === 'left' ? 'left' : 'right' }]
}

const getMarginBox = (node: DesignNode, page: PagePlacement): GuideRectangle | undefined => {
  const { guides } = node
  if (!guides) return undefined
  const { top, bottom, inner, outer } = guides.margins
  const leftMargin = page.side === 'right' ? inner : outer
  const rightMargin = page.side === 'right' ? outer : inner
  return {
    x: page.x + leftMargin,
    y: top,
    width: Math.max(0, page.width - leftMargin - rightMargin),
    height: Math.max(0, node.height - top - bottom)
  }
}

const getColumns = (box: GuideRectangle, count: number, gutter: number): GuideRectangle[] => {
  if (count <= 1) return []
  const columnWidth = (box.width - gutter * (count - 1)) / count
  return Array.from({ length: count }, (_, index) => ({
    ...box,
    x: box.x + index * (columnWidth + gutter),
    width: columnWidth
  }))
}

/**
 * Works out the guides of a frame's page setup: its trim and bleed boxes, the margin box of each
 * page, the columns inside them and the fold. A frame's box is its trim; the bleed lies outside.
 * @param node - A frame.
 * @returns The geometry, in the frame's own space, for the editor to draw. It is never exported.
 */
export const getPageGuideGeometry = (node: DesignNode): PageGuideGeometry => {
  const margins = getPagePlacements(node).flatMap((page) => getMarginBox(node, page) ?? [])
  return {
    trim: { x: 0, y: 0, width: node.width, height: node.height },
    bleed:
      node.bleed > 0
        ? {
            x: -node.bleed,
            y: -node.bleed,
            width: node.width + node.bleed * 2,
            height: node.height + node.bleed * 2
          }
        : undefined,
    margins,
    columns: margins.flatMap((box) =>
      getColumns(box, node.guides?.columns ?? 1, node.guides?.gutter ?? 0)
    ),
    fold: node.guides?.fold ? node.width / 2 : undefined
  }
}

const EMPTY_GUIDES: PageGuides = {
  margins: { top: 0, bottom: 0, inner: 0, outer: 0 },
  columns: 1,
  gutter: 0,
  fold: false
}

const withMargins = (
  current: PageMargins,
  given: PageSetupInput['margins'],
  unit: PageUnit
): PageMargins => ({
  top: given?.top === undefined ? current.top : toPoints(given.top, unit),
  bottom: given?.bottom === undefined ? current.bottom : toPoints(given.bottom, unit),
  inner: given?.inner === undefined ? current.inner : toPoints(given.inner, unit),
  outer: given?.outer === undefined ? current.outer : toPoints(given.outer, unit)
})

const hasGuideFields = (setup: PageSetupInput): boolean =>
  setup.margins !== undefined ||
  setup.columns !== undefined ||
  setup.gutter !== undefined ||
  setup.fold !== undefined

const mergeGuides = (
  current: PageGuides | null,
  setup: PageSetupInput,
  unit: PageUnit
): PageGuides => {
  const base = current ?? EMPTY_GUIDES
  return {
    margins: withMargins(base.margins, setup.margins, unit),
    columns: setup.columns ?? base.columns,
    gutter: setup.gutter === undefined ? base.gutter : toPoints(setup.gutter, unit),
    fold: setup.fold ?? base.fold
  }
}

const omitUndefined = (patch: PageSetupPatch): PageSetupPatch =>
  Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))

/**
 * Turns a page setup written in millimetres or points into the patch that applies it, so an agent
 * or a form can say "210 by 297 mm with 3 mm bleed" and the file stores points.
 * @param node - The frame the setup is for.
 * @param setup - The fields to change; lengths are in `setup.unit`, else the frame's own.
 * @returns A patch for an update operation, holding only what the setup changes.
 */
export const getPageSetupPatch = (node: DesignNode, setup: PageSetupInput): PageSetupPatch => {
  const unit = setup.unit ?? node.pageUnit
  const facing: PageFacing | undefined = setup.facing
  const lengths = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : toPoints(value, unit)
  const guides =
    setup.guides === null
      ? null
      : hasGuideFields(setup)
        ? mergeGuides(node.guides, setup, unit)
        : undefined
  return omitUndefined({
    pageUnit: setup.unit,
    width: lengths(setup.width),
    height: lengths(setup.height),
    bleed: lengths(setup.bleed),
    facing,
    guides
  })
}
