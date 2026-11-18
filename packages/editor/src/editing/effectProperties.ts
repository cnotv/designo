import {
  BLEND_MODES,
  type BlendMode,
  type DesignNode,
  type Gradient,
  type Shadow
} from '@designo/core'

const DEFAULT_GRADIENT_END = '#ffffff'
const DEFAULT_SHADOW_COLOR = '#00000040'
const DEFAULT_SHADOW_OFFSET = 4
const DEFAULT_SHADOW_BLUR = 8
const OPAQUE_HEX_LENGTH = 7

/** The blend modes in the order the control lists them. */
export const BLEND_MODE_OPTIONS: readonly { value: BlendMode; label: string }[] = BLEND_MODES.map(
  (value) => ({ value, label: `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}` })
)

/**
 * A new gradient for a node that has none, starting on the colour it already has so that turning
 * it on changes nothing until a stop is edited.
 * @param node - The node gaining the gradient.
 * @returns A two stop linear gradient from the node's fill to white.
 */
export const createDefaultGradient = (node: Pick<DesignNode, 'fill'>): Gradient => ({
  kind: 'linear',
  angle: 0,
  stops: [
    { offset: 0, color: node.fill ?? '#000000' },
    { offset: 1, color: DEFAULT_GRADIENT_END }
  ]
})

/**
 * A new shadow, soft and a little transparent, below and to the right.
 * @returns The shadow.
 */
export const createDefaultShadow = (): Shadow => ({
  x: DEFAULT_SHADOW_OFFSET,
  y: DEFAULT_SHADOW_OFFSET,
  blur: DEFAULT_SHADOW_BLUR,
  color: DEFAULT_SHADOW_COLOR
})

/**
 * Reads the value a select sends as a blend mode.
 * @param raw - What the control sent.
 * @returns The mode, or undefined for anything else.
 */
export const readBlendMode = (raw: unknown): BlendMode | undefined =>
  BLEND_MODE_OPTIONS.find((option) => option.value === raw)?.value

/**
 * Replaces one stop's colour, keeping the others.
 * @param gradient - The gradient to change.
 * @param index - Which stop.
 * @param color - Its new colour.
 * @returns A new gradient.
 */
export const withStopColor = (gradient: Gradient, index: number, color: string): Gradient => ({
  ...gradient,
  stops: gradient.stops.map((stop, stopIndex) => (stopIndex === index ? { ...stop, color } : stop))
})

/**
 * Keeps a colour's transparency when its opaque part is edited, since a colour input holds only
 * `#rrggbb`.
 * @param previous - The colour as it was, `#rrggbb` or `#rrggbbaa`.
 * @param edited - The `#rrggbb` the input now holds.
 * @returns The new colour with the old alpha.
 */
export const keepAlpha = (previous: string, edited: string): string =>
  `${edited}${previous.length > OPAQUE_HEX_LENGTH ? previous.slice(OPAQUE_HEX_LENGTH) : ''}`
