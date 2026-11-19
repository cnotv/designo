/**
 * Reads what was typed into the PDF page field of a frame.
 * @param raw - The field's text.
 * @returns A whole number from 1 for a page, null when the field was emptied (the frame is not a
 * page), or undefined when nothing usable was typed, which leaves the property as it was.
 */
export const readPdfPageInput = (raw: string): number | null | undefined => {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : undefined
}
