import { fromPoints, type PageUnit } from '@designo/core'

const DECIMALS = 100

/**
 * Shows a stored length, in points, in the unit the page is shown in.
 * @param points - The stored length.
 * @param unit - The page's unit.
 * @returns The length to put in a field, rounded to two decimals.
 */
export const formatLength = (points: number, unit: PageUnit): number =>
  Math.round(fromPoints(points, unit) * DECIMALS) / DECIMALS

/**
 * Reads what was typed into a length field of the page setup.
 * @param raw - The field's text.
 * @param minimum - The smallest length the field takes.
 * @returns The number, or undefined when nothing usable was typed, which leaves the field as it was.
 */
export const readLengthInput = (raw: string, minimum: number): number | undefined => {
  const value = Number(raw)
  return raw.trim() !== '' && Number.isFinite(value) ? Math.max(minimum, value) : undefined
}
