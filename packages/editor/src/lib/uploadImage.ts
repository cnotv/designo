import { assetIdSchema } from '@designo/storage/schemas'
import { z } from 'zod'

const uploadAnswerSchema = z.object({ assetId: assetIdSchema })
const errorAnswerSchema = z.object({ error: z.string() })

/**
 * Sends a picture to the Designo server's picture store.
 * @param file - The picture the person chose.
 * @returns The id to set as an image node's `imageAsset`.
 * @throws {Error} With a sentence a person can act on, when the server refuses the picture or
 * cannot be reached, as on a static demo.
 */
export const uploadImage = async (file: File): Promise<string> => {
  const response = await fetch('/api/files/assets', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  }).catch(() => undefined)
  if (!response) throw new Error('The picture could not be sent to the server')
  const body: unknown = await response.json().catch(() => undefined)
  const answer = uploadAnswerSchema.safeParse(body)
  if (answer.success) return answer.data.assetId
  const failure = errorAnswerSchema.safeParse(body)
  throw new Error(failure.success ? failure.data.error : 'The picture could not be stored')
}
