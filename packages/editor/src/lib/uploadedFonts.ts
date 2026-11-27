import { uploadedFontListSchema, uploadedFontSummarySchema } from '@designo/storage/schemas'
import type { UploadedFont } from '@designo/fonts'
import type { UploadedFontSummary } from '@designo/storage'
import { z } from 'zod'

const FONTS_ROUTE = '/api/files/fonts'
const errorAnswerSchema = z.object({ error: z.string() })

// The registered font types; a file the browser types otherwise goes as generic bytes, which the
// server also takes and checks by its signature.
const toFontContentType = (file: File): string =>
  file.type.startsWith('font/') ? file.type : 'application/octet-stream'

/**
 * Gives each uploaded font the address the editor loads its file from.
 * @param fonts - The account's fonts, as the server lists them.
 * @returns The fonts with their addresses.
 */
export const toServedFonts = (fonts: readonly UploadedFontSummary[]): UploadedFont[] =>
  fonts.map((font) => ({ ...font, url: `${FONTS_ROUTE}/${encodeURIComponent(font.id)}` }))

/**
 * Reads the fonts the signed-in account uploaded.
 * @returns The fonts; none when there is no Designo server behind the page, as on the static demo.
 */
export const fetchUploadedFonts = async (): Promise<UploadedFontSummary[]> => {
  const response = await fetch(FONTS_ROUTE).catch(() => undefined)
  if (!response?.ok) return []
  const parsed = uploadedFontListSchema.safeParse(await response.json().catch(() => undefined))
  return parsed.success ? parsed.data : []
}

/**
 * Sends a font file to the account's font store.
 * @param file - The TrueType or OpenType file the person chose.
 * @returns The stored font, with the family, weight and style the file declares.
 * @throws {Error} With a sentence a person can act on, when the server refuses the file or cannot
 * be reached, as on a static demo.
 */
export const uploadFont = async (file: File): Promise<UploadedFontSummary> => {
  const response = await fetch(FONTS_ROUTE, {
    method: 'POST',
    headers: { 'Content-Type': toFontContentType(file) },
    body: file
  }).catch(() => undefined)
  if (!response) throw new Error('The font could not be sent to the server')
  const body: unknown = await response.json().catch(() => undefined)
  const answer = uploadedFontSummarySchema.safeParse(body)
  if (answer.success) return answer.data
  const failure = errorAnswerSchema.safeParse(body)
  throw new Error(failure.success ? failure.data.error : 'The font could not be stored')
}
