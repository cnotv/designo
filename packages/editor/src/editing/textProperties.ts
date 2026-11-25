import {
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MIN_LETTER_SPACING,
  MIN_LINE_HEIGHT,
  type DesignNode,
  type FontStyle,
  type ListStyle,
  type TextAlign
} from '@designo/core'
import type { TextWidthMode } from './types.ts'

const PERCENT = 100

export const TEXT_ALIGN_OPTIONS: readonly { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Align text left' },
  { value: 'center', label: 'Align text centre' },
  { value: 'right', label: 'Align text right' },
  { value: 'justify', label: 'Justify text' }
]

/** The weights the properties panel offers, named as type designers do. */
export const FONT_WEIGHT_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'Extra light' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra bold' },
  { value: 900, label: 'Black' }
]

/**
 * The weights the weight select offers for a family.
 * @param available - The weights the family has; empty when the font list does not say.
 * @param current - The node's weight, kept in the list so the select never shows a blank.
 * @returns The options, lightest first.
 */
export const getFontWeightOptions = (
  available: readonly number[],
  current: number
): readonly { value: number; label: string }[] =>
  available.length === 0
    ? FONT_WEIGHT_OPTIONS
    : FONT_WEIGHT_OPTIONS.filter(
        (option) => option.value === current || available.includes(option.value)
      )

/**
 * Says whether the italic toggle can turn italic on.
 * @param availableStyles - The styles the family has; empty when the font list does not say.
 * @param current - The node's style, so an italic text can always be turned back to upright.
 * @returns False only for a family known to have no italic face.
 */
export const isItalicAvailable = (
  availableStyles: readonly string[],
  current: FontStyle
): boolean =>
  availableStyles.length === 0 || current === 'italic' || availableStyles.includes('italic')

export const TEXT_WIDTH_MODE_OPTIONS: readonly { value: TextWidthMode; label: string }[] = [
  { value: 'auto', label: 'Auto width' },
  { value: 'fixed', label: 'Fixed width' }
]

export const LIST_STYLE_OPTIONS: readonly { value: ListStyle; label: string }[] = [
  { value: 'none', label: 'No list' },
  { value: 'bullet', label: 'Bulleted list' },
  { value: 'number', label: 'Numbered list' }
]

// A toggle group sends an empty string when the pressed item is pressed again, which must not
// become a value.
const readOption = <Value extends string>(
  options: readonly { value: Value }[],
  raw: unknown
): Value | undefined => options.find((option) => option.value === raw)?.value

/**
 * Reads the value a toggle group sends as a text alignment.
 * @param raw - What the control sent.
 * @returns The alignment, or undefined for anything else, including a deselect.
 */
export const readTextAlign = (raw: unknown): TextAlign | undefined =>
  readOption(TEXT_ALIGN_OPTIONS, raw)

/**
 * Reads the value a toggle group sends as a width mode.
 * @param raw - What the control sent.
 * @returns The mode, or undefined for anything else, including a deselect.
 */
export const readTextWidthMode = (raw: unknown): TextWidthMode | undefined =>
  readOption(TEXT_WIDTH_MODE_OPTIONS, raw)

/**
 * Says which width mode a text node is in.
 * @param node - The text node.
 * @returns `fixed` when its lines wrap at its width, else `auto`.
 */
export const textWidthModeOf = (node: Pick<DesignNode, 'textWrap'>): TextWidthMode =>
  node.textWrap ? 'fixed' : 'auto'

/**
 * Reads what was typed into the line height field.
 * @param raw - The field's text.
 * @returns The line height held to the range a file allows, or undefined when nothing usable was
 * typed, which leaves the property as it was.
 */
export const readLineHeightInput = (raw: string): number | undefined => {
  const value = raw.trim() === '' ? Number.NaN : Number(raw)
  return Number.isFinite(value)
    ? Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, value))
    : undefined
}

/**
 * Reads the value the weight select sends.
 * @param raw - What the control sent, a weight as text.
 * @returns The weight, or undefined for anything the panel does not offer.
 */
export const readFontWeight = (raw: unknown): number | undefined =>
  FONT_WEIGHT_OPTIONS.find((option) => String(option.value) === String(raw))?.value

/**
 * Reads what was typed into the letter spacing field, which shows hundredths of the font size.
 * @param raw - The field's text, in percent of the font size.
 * @returns The spacing as a multiple of the font size, held to the range a file allows, or
 * undefined when nothing usable was typed.
 */
export const readLetterSpacingInput = (raw: string): number | undefined => {
  const percent = raw.trim() === '' ? Number.NaN : Number(raw)
  return Number.isFinite(percent)
    ? Math.min(MAX_LETTER_SPACING, Math.max(MIN_LETTER_SPACING, percent / PERCENT))
    : undefined
}

/**
 * Reads the value a toggle group sends as a list style.
 * @param raw - What the control sent.
 * @returns The style, or undefined for anything else, including a deselect.
 */
export const readListStyle = (raw: unknown): ListStyle | undefined =>
  readOption(LIST_STYLE_OPTIONS, raw)
