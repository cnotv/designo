import type { CodePointRange } from './types.ts'

const HEX_RADIX = 16
const RANGE_PATTERN = /^u\+([\da-f]+)(?:-([\da-f]+))?$/i

/**
 * Reads a code point range written the CSS way.
 * @param text - A range such as `U+0600-06FF`, or a single code point such as `U+00A0`.
 * @returns The first and last code point, both included.
 */
export const parseCodePointRange = (text: string): CodePointRange => {
  const match = RANGE_PATTERN.exec(text.trim())
  if (!match?.[1]) throw new Error(`Not a code point range: ${text}`)
  const first = Number.parseInt(match[1], HEX_RADIX)
  return [first, match[2] ? Number.parseInt(match[2], HEX_RADIX) : first]
}

/**
 * Says whether a code point falls in any of the ranges.
 * @param ranges - Parsed ranges.
 * @param codePoint - The character.
 * @returns True when one range holds it.
 */
export const isInCodePointRanges = (
  ranges: readonly CodePointRange[],
  codePoint: number
): boolean => ranges.some(([first, last]) => codePoint >= first && codePoint <= last)

const NEUTRAL_CHARACTER_PATTERN = /^[\p{Script=Common}\p{Script=Inherited}]$/u

/**
 * Says whether a character belongs to no script: a space, a digit, punctuation, a symbol or a
 * combining mark. Those stay in the font of the text around them; letters go to the first font
 * that has them, so a word after a symbol drawn by a fallback font returns to the text's own font.
 * @param character - One character.
 * @returns True for characters of the Common and Inherited scripts.
 */
export const isNeutralCharacter = (character: string): boolean =>
  NEUTRAL_CHARACTER_PATTERN.test(character)
