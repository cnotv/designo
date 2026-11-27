import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileIdSchema } from '@designo/storage/schemas'
import { z } from 'zod'
import { presenceStateSchema } from './presence.ts'
import type { PresenceEntry } from './types.ts'

const PRESENCE_DIRECTORY = '.presence'
// A file older than this belongs to a server that stopped without clearing it.
const PRESENCE_MAX_AGE_MILLISECONDS = 60_000

const presenceFileSchema = z.object({
  updatedAt: z.number(),
  entries: z.array(presenceStateSchema.extend({ clientId: z.number() }))
})

const presencePath = (dataDirectory: string, fileId: string): string =>
  path.join(dataDirectory, PRESENCE_DIRECTORY, `${fileIdSchema.parse(fileId)}.json`)

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Writes who is on a file, so an MCP server in another process can answer `get_selection`.
 * @param dataDirectory - Where Designo files live.
 * @param fileId - The file.
 * @param entries - Everyone's presence.
 * @param now - The current time in milliseconds.
 * @returns Resolves once the file is in place.
 */
export const writePresenceFile = async (
  dataDirectory: string,
  fileId: string,
  entries: readonly PresenceEntry[],
  now: number
): Promise<void> => {
  const target = presencePath(dataDirectory, fileId)
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify({ updatedAt: now, entries }), 'utf8')
  await rename(temporary, target)
}

/**
 * Reads who is on a file, as the sync server last wrote it.
 * @param dataDirectory - Where Designo files live.
 * @param fileId - The file.
 * @param now - The current time in milliseconds.
 * @returns Everyone's presence; empty when no server wrote it lately.
 */
export const readPresenceFile = async (
  dataDirectory: string,
  fileId: string,
  now: number
): Promise<PresenceEntry[]> => {
  const raw = await readFile(presencePath(dataDirectory, fileId), 'utf8').catch(() => undefined)
  if (raw === undefined) return []
  const parsed = presenceFileSchema.safeParse(parseJson(raw))
  if (!parsed.success || now - parsed.data.updatedAt > PRESENCE_MAX_AGE_MILLISECONDS) return []
  return parsed.data.entries
}
