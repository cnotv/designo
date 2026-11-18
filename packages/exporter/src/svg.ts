import {
  DEFAULT_NODE_PROPERTIES,
  getChildren,
  getEffectReach,
  getFillGradient,
  hasLayerEffects,
  getGradientLine,
  getPaintOrder,
  withFontSubstitutes,
  type DesignDocument,
  type DesignNode,
  type Gradient,
  type TextAlign
} from '@designo/core'
import type { Bounds, SvgExportOptions } from './types.ts'
import { boundsOverlap, getPaintReach, intersectBounds, toNodeSpace } from './visibleRegion.ts'

// Where a line is anchored across the node's width. Left sets no attribute, so a left-aligned
// node is written exactly as it was before alignment existed.
const TEXT_ANCHORS: Record<TextAlign, { attribute: string | undefined; widthShare: number }> = {
  left: { attribute: undefined, widthShare: 0 },
  center: { attribute: 'middle', widthShare: 0.5 },
  right: { attribute: 'end', widthShare: 1 }
}
const DEGREES_TO_RADIANS = Math.PI / 180
const COORDINATE_DECIMALS = 3
const TAB = 0x9
const LINE_FEED = 0xa
const CARRIAGE_RETURN = 0xd
const FIRST_PRINTABLE = 0x20
const LAST_BEFORE_SURROGATES = 0xd7ff
const FIRST_AFTER_SURROGATES = 0xe000
const LAST_BASIC_CHARACTER = 0xfffd
const FIRST_SUPPLEMENTARY_CHARACTER = 0x10000
const EMPTY_PAGE_BOUNDS: Bounds = { x: 0, y: 0, width: 1, height: 1 }

const formatNumber = (value: number): string => String(Number(value.toFixed(COORDINATE_DECIMALS)))

// XML 1.0 allows tab, newline, carriage return and the ranges below; anything else, such as a
// control character an agent pasted in, makes the parser refuse the whole document.
const isXmlCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0
  return (
    codePoint === TAB ||
    codePoint === LINE_FEED ||
    codePoint === CARRIAGE_RETURN ||
    (codePoint >= FIRST_PRINTABLE && codePoint <= LAST_BEFORE_SURROGATES) ||
    (codePoint >= FIRST_AFTER_SURROGATES && codePoint <= LAST_BASIC_CHARACTER) ||
    codePoint >= FIRST_SUPPLEMENTARY_CHARACTER
  )
}

const escapeXml = (value: string): string =>
  [...value]
    .filter(isXmlCharacter)
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const toClipId = (nodeId: string): string => `clip-${nodeId.replaceAll(/[^\w-]/g, '-')}`

const centerOf = (node: DesignNode): { x: number; y: number } => ({
  x: node.x + node.width / 2,
  y: node.y + node.height / 2
})

/**
 * The box a node covers once rotated about its centre.
 * @param node - The node to measure.
 * @returns The enclosing axis-aligned box.
 */
const getRotatedBounds = (node: DesignNode): Bounds => {
  const radians = node.rotation * DEGREES_TO_RADIANS
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const width = node.width * cosine + node.height * sine
  const height = node.width * sine + node.height * cosine
  const center = centerOf(node)
  const reach = hasFilter(node) ? getEffectReach(node) : 0
  return {
    x: center.x - width / 2 - reach,
    y: center.y - height / 2 - reach,
    width: width + reach * 2,
    height: height + reach * 2
  }
}

const unionBounds = (boxes: readonly Bounds[]): Bounds => {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const getExportBounds = (document: DesignDocument, node: DesignNode): Bounds => {
  if (node.type !== 'page') return getRotatedBounds(node)
  const descendants = getPaintOrder(document, node.id)
  return descendants.length === 0
    ? EMPTY_PAGE_BOUNDS
    : unionBounds(descendants.map((descendant) => getRotatedBounds(descendant)))
}

const toGradientId = (nodeId: string): string => `gradient-${nodeId.replaceAll(/[^\w-]/g, '-')}`
const toEffectsId = (nodeId: string): string => `effects-${nodeId.replaceAll(/[^\w-]/g, '-')}`

const renderStops = (gradient: Gradient): string =>
  gradient.stops
    .map(
      (stop) =>
        `<stop offset="${formatNumber(stop.offset)}" stop-color="${escapeXml(stop.color)}"/>`
    )
    .join('')

// A linear gradient is placed in the node's space, so a rotated node turns its gradient with it
// and a box that is not square keeps the angle; a radial one fills the box's inscribed ellipse.
const renderGradientDefinition = (node: DesignNode, gradient: Gradient): string => {
  const id = toGradientId(node.id)
  if (gradient.kind === 'radial') {
    return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${renderStops(gradient)}</radialGradient>`
  }
  const line = getGradientLine(node, gradient)
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${formatNumber(node.x + line.startX)}" y1="${formatNumber(node.y + line.startY)}" x2="${formatNumber(node.x + line.endX)}" y2="${formatNumber(node.y + line.endY)}">${renderStops(gradient)}</linearGradient>`
}

// Blur, shadow and blend mode apply to the two shapes the renderers can draw them for on their own.
const hasFilter = (node: DesignNode): boolean =>
  hasLayerEffects(node) && (node.blur > 0 || node.shadow !== null)

// The region reaches past the box by what the effects can paint, or the filter would cut a soft
// edge short. The shadow is cast by the sharp shape, and the blur only softens the shape itself.
const renderFilterDefinition = (node: DesignNode): string => {
  const reach = getEffectReach(node)
  const region = `filterUnits="userSpaceOnUse" x="${formatNumber(node.x - reach)}" y="${formatNumber(node.y - reach)}" width="${formatNumber(node.width + reach * 2)}" height="${formatNumber(node.height + reach * 2)}"`
  const body =
    node.blur > 0
      ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${formatNumber(node.blur)}" result="body"/>`
      : '<feMerge result="body"><feMergeNode in="SourceGraphic"/></feMerge>'
  const shadow = node.shadow
    ? `<feGaussianBlur in="SourceAlpha" stdDeviation="${formatNumber(node.shadow.blur)}" result="softened"/><feOffset in="softened" dx="${formatNumber(node.shadow.x)}" dy="${formatNumber(node.shadow.y)}" result="moved"/><feFlood flood-color="${escapeXml(node.shadow.color)}"/><feComposite in2="moved" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="body"/></feMerge>`
    : ''
  return `<filter id="${toEffectsId(node.id)}" ${region}>${body}${shadow}</filter>`
}

/**
 * The `defs` a node's gradient and filter need, written ahead of the node.
 * @param node - The node about to be drawn.
 * @returns A `defs` element, or an empty string when the node needs none.
 */
const renderDefinitions = (node: DesignNode): string => {
  const gradient = getFillGradient(node)
  const parts = [
    ...(gradient ? [renderGradientDefinition(node, gradient)] : []),
    ...(hasFilter(node) ? [renderFilterDefinition(node)] : [])
  ]
  return parts.length === 0 ? '' : `<defs>${parts.join('')}</defs>`
}

const paintAttributes = (node: DesignNode): string =>
  [
    `fill="${getFillGradient(node) ? `url(#${toGradientId(node.id)})` : node.fill === null ? 'none' : escapeXml(node.fill)}"`,
    ...(node.stroke === null
      ? []
      : [`stroke="${escapeXml(node.stroke)}"`, `stroke-width="${formatNumber(node.strokeWidth)}"`])
  ].join(' ')

const presentationAttributes = (node: DesignNode): string[] => {
  const center = centerOf(node)
  return [
    ...(node.opacity === 1 ? [] : [`opacity="${formatNumber(node.opacity)}"`]),
    ...(hasFilter(node) ? [`filter="url(#${toEffectsId(node.id)})"`] : []),
    ...(node.blendMode === 'normal' || !hasLayerEffects(node)
      ? []
      : [`style="mix-blend-mode:${node.blendMode}"`]),
    ...(node.rotation === 0
      ? []
      : [
          `transform="rotate(${formatNumber(node.rotation)} ${formatNumber(center.x)} ${formatNumber(center.y)})"`
        ])
  ]
}

const joinAttributes = (attributes: readonly string[]): string => attributes.join(' ')

const roundedRectangleAttributes = (node: DesignNode): string[] => [
  `x="${formatNumber(node.x)}"`,
  `y="${formatNumber(node.y)}"`,
  `width="${formatNumber(node.width)}"`,
  `height="${formatNumber(node.height)}"`,
  ...(node.cornerRadius > 0
    ? [`rx="${formatNumber(node.cornerRadius)}"`, `ry="${formatNumber(node.cornerRadius)}"`]
    : [])
]

const renderRectangleShape = (node: DesignNode, extraAttributes: readonly string[]): string =>
  `<rect ${joinAttributes([...roundedRectangleAttributes(node), ...extraAttributes])}/>`

const renderEllipse = (node: DesignNode): string => {
  const center = centerOf(node)
  return `${renderDefinitions(node)}<ellipse ${joinAttributes([
    `cx="${formatNumber(center.x)}"`,
    `cy="${formatNumber(center.y)}"`,
    `rx="${formatNumber(node.width / 2)}"`,
    `ry="${formatNumber(node.height / 2)}"`,
    paintAttributes(node),
    ...presentationAttributes(node)
  ])}/>`
}

const getTextAnchorX = (node: DesignNode): number =>
  node.x + node.width * TEXT_ANCHORS[node.textAlign].widthShare

// The editor centres a line's glyphs in its line box, so a taller line box moves the first line
// down by half of the extra. SVG has no line box, so the same move is made to the baseline.
const getFirstLineOffset = (node: DesignNode): number =>
  ((node.lineHeight - DEFAULT_NODE_PROPERTIES.lineHeight) * node.fontSize) / 2

// Where a line's text sits, from the top of the box: its alphabetic baseline when the font's
// metrics are known, placed as the editor places it (the line box centred on the font's ascent
// and descent), or the top of the line, hanging, when they are not.
const lineOffsets = (
  node: DesignNode,
  options: SvgExportOptions
): { firstLine: number; hanging: boolean } => {
  const metrics = options.getFontMetrics?.(node.fontFamily)
  if (!metrics) return { firstLine: getFirstLineOffset(node), hanging: true }
  const lineHeight = node.fontSize * node.lineHeight
  const ascent = (metrics.ascender / metrics.unitsPerEm) * node.fontSize
  const descent = (-metrics.descender / metrics.unitsPerEm) * node.fontSize
  return { firstLine: (lineHeight - ascent - descent) / 2 + ascent, hanging: false }
}

// Each line sets its own y instead of a dy from the line before: an empty tspan contributes
// nothing, so a blank line carried by dy would vanish and the paragraphs would close up.
const renderTextContent = (node: DesignNode, options: SvgExportOptions): string => {
  const lines = node.text.split('\n')
  if (lines.length === 1) return escapeXml(node.text)
  const lineHeight = node.fontSize * node.lineHeight
  const { firstLine } = lineOffsets(node, options)
  return lines
    .flatMap((line, index) =>
      line === ''
        ? []
        : [
            `<tspan x="${formatNumber(getTextAnchorX(node))}" y="${formatNumber(node.y + firstLine + index * lineHeight)}">${escapeXml(line)}</tspan>`
          ]
    )
    .join('')
}

const textAnchorAttributes = (node: DesignNode): string[] => {
  const { attribute } = TEXT_ANCHORS[node.textAlign]
  return attribute === undefined ? [] : [`text-anchor="${attribute}"`]
}

const renderText = (node: DesignNode, options: SvgExportOptions): string => {
  const { firstLine, hanging } = lineOffsets(node, options)
  return `<text ${joinAttributes([
    `x="${formatNumber(getTextAnchorX(node))}"`,
    `y="${formatNumber(node.y + firstLine)}"`,
    `font-family="${escapeXml(options.resolveFontFamily?.(node.fontFamily) ?? withFontSubstitutes(node.fontFamily))}"`,
    `font-size="${formatNumber(node.fontSize)}"`,
    ...textAnchorAttributes(node),
    ...(hanging ? ['dominant-baseline="hanging"'] : []),
    paintAttributes(node),
    ...presentationAttributes(node)
  ])}>${renderTextContent(node, options)}</text>`
}

const wrapInGroup = (attributes: readonly string[], content: string): string =>
  attributes.length === 0 ? content : `<g ${joinAttributes(attributes)}>${content}</g>`

// The region is what can show, in the space the children are drawn in: the export bounds, cut
// down by every clipping frame above. A child outside it is invisible, and it must not be written:
// resvg aborts the whole process on a clipped group whose content lies more than a canvas size
// beyond the canvas, which an agent's stray child of a frame far from the origin is enough to do.
const renderChildren = (
  document: DesignDocument,
  node: DesignNode,
  region: Bounds | undefined,
  options: SvgExportOptions
): string =>
  region === undefined
    ? ''
    : getChildren(document, node.id)
        .map((child) => renderNode(document, child, region, options))
        .join('')

const renderFrame = (
  document: DesignDocument,
  node: DesignNode,
  region: Bounds,
  options: SvgExportOptions
): string => {
  const clipId = toClipId(node.id)
  const background = `${renderDefinitions(node)}${renderRectangleShape(node, [paintAttributes(node)])}`
  const clip = `<clipPath id="${clipId}">${renderRectangleShape(node, [])}</clipPath>`
  const childRegion = intersectBounds(region, node)
  const children = `<g clip-path="url(#${clipId})">${renderChildren(document, node, childRegion, options)}</g>`
  return wrapInGroup(presentationAttributes(node), `${background}${clip}${children}`)
}

const isOutsideRegion = (node: DesignNode, region: Bounds): boolean =>
  node.type !== 'page' && node.type !== 'group' && !boundsOverlap(getPaintReach(node), region)

const renderNode = (
  document: DesignDocument,
  node: DesignNode,
  parentRegion: Bounds,
  options: SvgExportOptions
): string => {
  if (!node.visible) return ''
  const region = toNodeSpace(parentRegion, node)
  if (isOutsideRegion(node, region)) return ''
  const renderers: Record<DesignNode['type'], () => string> = {
    page: () => renderChildren(document, node, region, options),
    group: () =>
      wrapInGroup(presentationAttributes(node), renderChildren(document, node, region, options)),
    frame: () => renderFrame(document, node, region, options),
    rectangle: () =>
      `${renderDefinitions(node)}${renderRectangleShape(node, [paintAttributes(node), ...presentationAttributes(node)])}`,
    ellipse: () => renderEllipse(node),
    text: () => renderText(node, options)
  }
  return renderers[node.type]()
}

/**
 * Draws a node and everything inside it as a standalone SVG. Coordinates stay absolute on the
 * page and the viewBox is the node's bounds (for a page, the bounds of its visible content).
 * Text is plain SVG text without shaping, so it will not match the canvas exactly: lines follow
 * `textAlign` and `lineHeight`, but never wrap, so a fixed-width text node is drawn line by line
 * as written.
 * @param document - The document to read.
 * @param nodeId - The page, frame or any node to export.
 * @param options - Which font draws each text and where its baseline sits; the node's own family
 *   list, hanging from the top of its box, without them.
 * @returns The SVG source.
 */
export const exportNodeToSvg = (
  document: DesignDocument,
  nodeId: string,
  options: SvgExportOptions = {}
): string => {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`Node ${nodeId} does not exist`)
  const bounds = getExportBounds(document, node)
  const width = formatNumber(bounds.width)
  const height = formatNumber(bounds.height)
  const viewBox = `${formatNumber(bounds.x)} ${formatNumber(bounds.y)} ${width} ${height}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${renderNode(document, node, bounds, options)}</svg>`
}
