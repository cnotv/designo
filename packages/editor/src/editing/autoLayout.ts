import {
  LAYOUT_ALIGNMENTS,
  LAYOUT_CROSS_ALIGNMENTS,
  LAYOUT_MODES,
  LAYOUT_SIZINGS,
  type DesignNode,
  type LayoutAlign,
  type LayoutCrossAlign,
  type LayoutMode,
  type LayoutSizing
} from '@designo/core'

export const LAYOUT_MODE_OPTIONS: readonly { value: LayoutMode; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'horizontal', label: 'Row' },
  { value: 'vertical', label: 'Column' }
]

export const LAYOUT_ALIGN_OPTIONS: readonly { value: LayoutAlign; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Centre' },
  { value: 'end', label: 'End' },
  { value: 'space-between', label: 'Space between' }
]

export const LAYOUT_CROSS_ALIGN_OPTIONS: readonly { value: LayoutCrossAlign; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Centre' },
  { value: 'end', label: 'End' }
]

const SIZING_LABELS: Record<LayoutSizing, string> = {
  fixed: 'Fixed',
  hug: 'Hug contents',
  fill: 'Fill container'
}

// A select sends its value as text; anything outside the list is not a value.
const readFrom = <Value extends string>(
  values: readonly Value[],
  raw: unknown
): Value | undefined => values.find((value) => value === raw)

/**
 * Reads what a control sent as a layout direction.
 * @param raw - What the control sent.
 * @returns The direction, or undefined for anything else, including a deselect.
 */
export const readLayoutMode = (raw: unknown): LayoutMode | undefined => readFrom(LAYOUT_MODES, raw)

/**
 * Reads what a control sent as an alignment along the layout direction.
 * @param raw - What the control sent.
 * @returns The alignment, or undefined for anything else.
 */
export const readLayoutAlign = (raw: unknown): LayoutAlign | undefined =>
  readFrom(LAYOUT_ALIGNMENTS, raw)

/**
 * Reads what a control sent as an alignment across the layout direction.
 * @param raw - What the control sent.
 * @returns The alignment, or undefined for anything else.
 */
export const readLayoutCrossAlign = (raw: unknown): LayoutCrossAlign | undefined =>
  readFrom(LAYOUT_CROSS_ALIGNMENTS, raw)

/**
 * Reads what a control sent as a sizing.
 * @param raw - What the control sent.
 * @returns The sizing, or undefined for anything else.
 */
export const readLayoutSizing = (raw: unknown): LayoutSizing | undefined =>
  readFrom(LAYOUT_SIZINGS, raw)

/**
 * Lists the sizings a node can take: hug only means something on an auto-layout frame, and fill
 * only inside an auto-layout parent. The node's current sizing stays listed, so a select never
 * shows a value it cannot name.
 * @param node - The node being edited.
 * @param parent - Its parent, if any.
 * @param current - The node's sizing on the axis being edited.
 * @returns The options to offer, with labels.
 */
export const sizingOptionsFor = (
  node: DesignNode,
  parent: DesignNode | undefined,
  current: LayoutSizing
): { value: LayoutSizing; label: string }[] =>
  LAYOUT_SIZINGS.filter(
    (sizing) =>
      sizing === current ||
      sizing === 'fixed' ||
      (sizing === 'hug' && node.layoutMode !== 'none') ||
      (sizing === 'fill' && parent !== undefined && parent.layoutMode !== 'none')
  ).map((value) => ({ value, label: SIZING_LABELS[value] }))
