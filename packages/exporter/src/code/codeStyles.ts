import {
  getFillGradient,
  getSizing,
  hasLayerEffects,
  type DesignNode,
  type Gradient,
  type ImageFit,
  type LayoutAlign,
  type LayoutCrossAlign
} from '@designo/core'
import type { CssDeclaration } from '../types.ts'

const DECIMALS = 3
// A designed angle points right at 0 and turns clockwise; a CSS gradient angle points up at 0.
const CSS_GRADIENT_ANGLE_OFFSET = 90
const PERCENT = 100
const NORMAL_FONT_WEIGHT = 400
// CSS draws a box shadow's blur as a radius twice the standard deviation Designo stores.
const SHADOW_BLUR_RADIUS_PER_DEVIATION = 2

const JUSTIFY: Record<LayoutAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between'
}
const ALIGN: Record<LayoutCrossAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end'
}
const OBJECT_FIT: Record<ImageFit, string> = { stretch: 'fill', fit: 'contain', fill: 'cover' }

/**
 * Writes a number for CSS, rounded to three decimals.
 * @param value - The number.
 * @returns It without trailing zeros.
 */
export const formatCssNumber = (value: number): string => String(Number(value.toFixed(DECIMALS)))

const pixels = (value: number): string => (value === 0 ? '0' : `${formatCssNumber(value)}px`)

const gradientStops = (gradient: Gradient): string =>
  gradient.stops
    .map((stop) => `${stop.color} ${formatCssNumber(stop.offset * PERCENT)}%`)
    .join(', ')

const gradientBackground = (gradient: Gradient): string =>
  gradient.kind === 'radial'
    ? `radial-gradient(closest-side, ${gradientStops(gradient)})`
    : `linear-gradient(${formatCssNumber(gradient.angle + CSS_GRADIENT_ANGLE_OFFSET)}deg, ${gradientStops(gradient)})`

const when = (condition: boolean, declarations: readonly CssDeclaration[]): CssDeclaration[] =>
  condition ? [...declarations] : []

// Inside an auto-layout frame the browser places the node; anywhere else it keeps its spot.
const placement = (node: DesignNode, parent: DesignNode | undefined): CssDeclaration[] => {
  if (!parent) return [['position', 'relative']]
  if (parent.layoutMode !== 'none') return []
  return [
    ['position', 'absolute'],
    ['left', pixels(node.x - parent.x)],
    ['top', pixels(node.y - parent.y)]
  ]
}

const mainAxisOf = (parent: DesignNode): 'width' | 'height' =>
  parent.layoutMode === 'horizontal' ? 'width' : 'height'

// A text's height follows its lines, and a text that does not wrap takes the width of its words.
const followsText = (node: DesignNode, axis: 'width' | 'height'): boolean =>
  node.type === 'text' && (axis === 'height' || !node.textWrap)

const axisSize = (
  node: DesignNode,
  parent: DesignNode | undefined,
  axis: 'width' | 'height'
): CssDeclaration[] => {
  const sizing = getSizing(node, axis)
  // A hugging frame takes the size of its children; on anything else hug keeps the stored size.
  if (sizing === 'hug' && node.layoutMode !== 'none') return []
  if (sizing === 'fill' && parent && parent.layoutMode !== 'none')
    return mainAxisOf(parent) === axis ? [['flex', '1 1 0']] : [['align-self', 'stretch']]
  return followsText(node, axis) ? [] : [[axis, pixels(node[axis])]]
}

const size = (node: DesignNode, parent: DesignNode | undefined): CssDeclaration[] => [
  ...axisSize(node, parent, 'width'),
  ...axisSize(node, parent, 'height'),
  ...when(parent?.layoutMode !== undefined && parent.layoutMode !== 'none', [['flex-shrink', '0']])
]

const autoLayout = (node: DesignNode): CssDeclaration[] =>
  when(node.layoutMode !== 'none', [
    ['display', 'flex'],
    ['flex-direction', node.layoutMode === 'horizontal' ? 'row' : 'column'],
    ['justify-content', JUSTIFY[node.layoutAlign]],
    ['align-items', ALIGN[node.layoutCrossAlign]],
    ...when(node.layoutGap !== 0, [['gap', pixels(node.layoutGap)]]),
    ...when(node.layoutPadding !== 0, [['padding', pixels(node.layoutPadding)]]),
    ['box-sizing', 'border-box']
  ])

const paint = (node: DesignNode): CssDeclaration[] => {
  if (node.type === 'text' || node.type === 'path' || node.type === 'group') return []
  const gradient = getFillGradient(node)
  if (gradient) return [['background', gradientBackground(gradient)]]
  return when(node.fill !== null && node.type !== 'image', [['background-color', node.fill ?? '']])
}

const shape = (node: DesignNode): CssDeclaration[] => [
  ...when(node.type === 'ellipse', [['border-radius', '50%']]),
  ...when(node.type !== 'ellipse' && node.cornerRadius > 0, [
    ['border-radius', pixels(node.cornerRadius)]
  ]),
  // An outline pulled in by half its width is centred on the edge, as the canvas strokes it.
  ...when(
    node.stroke !== null && node.strokeWidth > 0 && node.type !== 'path' && node.type !== 'text',
    [
      ['outline', `${pixels(node.strokeWidth)} solid ${node.stroke ?? ''}`],
      ['outline-offset', pixels(-node.strokeWidth / 2)]
    ]
  ),
  // Frames clip their children.
  ...when(node.type === 'frame', [['overflow', 'hidden']]),
  ...when(node.type === 'image', [['object-fit', OBJECT_FIT[node.imageFit]]])
]

const effects = (node: DesignNode): CssDeclaration[] => [
  ...when(node.opacity < 1, [['opacity', formatCssNumber(node.opacity)]]),
  ...when(node.rotation !== 0, [['transform', `rotate(${formatCssNumber(node.rotation)}deg)`]]),
  ...when(hasLayerEffects(node) && node.blur > 0, [['filter', `blur(${pixels(node.blur)})`]]),
  ...when(hasLayerEffects(node) && node.shadow !== null, [
    [
      'box-shadow',
      node.shadow
        ? `${pixels(node.shadow.x)} ${pixels(node.shadow.y)} ${pixels(node.shadow.blur * SHADOW_BLUR_RADIUS_PER_DEVIATION)} ${node.shadow.color}`
        : ''
    ]
  ]),
  ...when(hasLayerEffects(node) && node.blendMode !== 'normal', [
    ['mix-blend-mode', node.blendMode]
  ])
]

const typography = (node: DesignNode): CssDeclaration[] =>
  when(node.type === 'text', [
    ['margin', '0'],
    ['color', node.fill ?? 'inherit'],
    ['font-family', node.fontFamily],
    ['font-size', pixels(node.fontSize)],
    ...when(node.fontWeight !== NORMAL_FONT_WEIGHT, [['font-weight', String(node.fontWeight)]]),
    ...when(node.fontStyle !== 'normal', [['font-style', node.fontStyle]]),
    ['line-height', formatCssNumber(node.lineHeight)],
    ...when(node.letterSpacing !== 0, [
      ['letter-spacing', `${formatCssNumber(node.letterSpacing)}em`]
    ]),
    ...when(node.textAlign !== 'left', [['text-align', node.textAlign]]),
    ['white-space', node.textWrap ? 'pre-wrap' : 'pre'],
    ...when(node.listStyle !== 'none', [['padding-left', `${formatCssNumber(node.listIndent)}em`]])
  ])

/**
 * The CSS that places and paints a node like the canvas does.
 * @param node - The node, with masters resolved and auto-layout applied.
 * @param parent - Its parent in the export; undefined for the exported node itself.
 * @returns The declarations, in a stable order.
 */
export const getNodeStyle = (
  node: DesignNode,
  parent: DesignNode | undefined
): CssDeclaration[] => [
  ...placement(node, parent),
  ...size(node, parent),
  ...autoLayout(node),
  ...paint(node),
  ...shape(node),
  ...typography(node),
  ...effects(node)
]
