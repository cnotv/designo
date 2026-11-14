import { getChildren, getPaintOrder, type DesignDocument, type DesignNode } from '@designo/core'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

const LINE_HEIGHT_FACTOR = 1.2
const DEGREES_TO_RADIANS = Math.PI / 180
const COORDINATE_DECIMALS = 3
const EMPTY_PAGE_BOUNDS: Bounds = { x: 0, y: 0, width: 1, height: 1 }

const formatNumber = (value: number): string => String(Number(value.toFixed(COORDINATE_DECIMALS)))

const escapeXml = (value: string): string =>
  value
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
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
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

const paintAttributes = (node: DesignNode): string =>
  [
    `fill="${node.fill === null ? 'none' : escapeXml(node.fill)}"`,
    ...(node.stroke === null
      ? []
      : [`stroke="${escapeXml(node.stroke)}"`, `stroke-width="${formatNumber(node.strokeWidth)}"`])
  ].join(' ')

const presentationAttributes = (node: DesignNode): string[] => {
  const center = centerOf(node)
  return [
    ...(node.opacity === 1 ? [] : [`opacity="${formatNumber(node.opacity)}"`]),
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
  return `<ellipse ${joinAttributes([
    `cx="${formatNumber(center.x)}"`,
    `cy="${formatNumber(center.y)}"`,
    `rx="${formatNumber(node.width / 2)}"`,
    `ry="${formatNumber(node.height / 2)}"`,
    paintAttributes(node),
    ...presentationAttributes(node)
  ])}/>`
}

const renderTextContent = (node: DesignNode): string => {
  const lines = node.text.split('\n')
  if (lines.length === 1) return escapeXml(node.text)
  const lineHeight = formatNumber(node.fontSize * LINE_HEIGHT_FACTOR)
  return lines
    .map(
      (line, index) =>
        `<tspan x="${formatNumber(node.x)}" dy="${index === 0 ? '0' : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join('')
}

const renderText = (node: DesignNode): string =>
  `<text ${joinAttributes([
    `x="${formatNumber(node.x)}"`,
    `y="${formatNumber(node.y)}"`,
    `font-family="${escapeXml(node.fontFamily)}"`,
    `font-size="${formatNumber(node.fontSize)}"`,
    'dominant-baseline="hanging"',
    paintAttributes(node),
    ...presentationAttributes(node)
  ])}>${renderTextContent(node)}</text>`

const wrapInGroup = (attributes: readonly string[], content: string): string =>
  attributes.length === 0 ? content : `<g ${joinAttributes(attributes)}>${content}</g>`

const renderChildren = (document: DesignDocument, node: DesignNode): string =>
  getChildren(document, node.id)
    .map((child) => renderNode(document, child))
    .join('')

const renderFrame = (document: DesignDocument, node: DesignNode): string => {
  const clipId = toClipId(node.id)
  const background = renderRectangleShape(node, [paintAttributes(node)])
  const clip = `<clipPath id="${clipId}">${renderRectangleShape(node, [])}</clipPath>`
  const children = `<g clip-path="url(#${clipId})">${renderChildren(document, node)}</g>`
  return wrapInGroup(presentationAttributes(node), `${background}${clip}${children}`)
}

const renderNode = (document: DesignDocument, node: DesignNode): string => {
  if (!node.visible) return ''
  const renderers: Record<DesignNode['type'], () => string> = {
    page: () => renderChildren(document, node),
    group: () => wrapInGroup(presentationAttributes(node), renderChildren(document, node)),
    frame: () => renderFrame(document, node),
    rectangle: () =>
      renderRectangleShape(node, [paintAttributes(node), ...presentationAttributes(node)]),
    ellipse: () => renderEllipse(node),
    text: () => renderText(node)
  }
  return renderers[node.type]()
}

/**
 * Draws a node and everything inside it as a standalone SVG. Coordinates stay absolute on the
 * page and the viewBox is the node's bounds (for a page, the bounds of its visible content).
 * Text is plain SVG text without shaping, so it will not match the canvas exactly.
 * @param document - The document to read.
 * @param nodeId - The page, frame or any node to export.
 * @returns The SVG source.
 */
export const exportNodeToSvg = (document: DesignDocument, nodeId: string): string => {
  const node = document.nodes[nodeId]
  if (!node) throw new Error(`Node ${nodeId} does not exist`)
  const bounds = getExportBounds(document, node)
  const width = formatNumber(bounds.width)
  const height = formatNumber(bounds.height)
  const viewBox = `${formatNumber(bounds.x)} ${formatNumber(bounds.y)} ${width} ${height}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${renderNode(document, node)}</svg>`
}
