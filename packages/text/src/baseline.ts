/**
 * Finds where a line of text sits, the way CSS lays out a line box: the font's ascent and descent
 * are centred in the line height. The canvas uses it so its text lines up with the editor's
 * textarea, which CSS lays out.
 * @param lineIndex - Which line, from 0.
 * @param fontSize - The font size.
 * @param lineHeightMultiple - The line height as a multiple of the font size.
 * @param fontAscent - The font's ascent at that size, above the baseline.
 * @param fontDescent - The font's descent at that size, below the baseline.
 * @returns The baseline's distance from the top of the text box.
 */
export const getTextBaselineOffset = (
  lineIndex: number,
  fontSize: number,
  lineHeightMultiple: number,
  fontAscent: number,
  fontDescent: number
): number => {
  const lineHeight = fontSize * lineHeightMultiple
  return lineIndex * lineHeight + (lineHeight - fontAscent - fontDescent) / 2 + fontAscent
}
