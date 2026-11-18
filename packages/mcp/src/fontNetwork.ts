import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FontFetch } from '@designo/fonts'
import { z } from 'zod'

const REQUEST_TIMEOUT_MILLISECONDS = 10_000
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

const cachedAnswerSchema = z.object({ status: z.number(), body: z.unknown() })

/**
 * Names a cache file after what it holds.
 * @param url - The address the file came from.
 * @returns A name that is the same for the same address and safe on disk.
 */
export const cacheKey = (url: string): string => createHash('sha256').update(url).digest('hex')

/**
 * Writes a file beside its final name and renames it, so a screenshot running alongside never
 * reads half a file.
 * @param path - Where the file goes.
 * @param content - What it holds.
 */
export const writeAtomically = async (
  path: string,
  content: string | Uint8Array
): Promise<void> => {
  const temporary = `${path}.${randomUUID()}.part`
  await writeFile(temporary, content)
  await rename(temporary, path)
}

const answerFromCache = (status: number, body: unknown) => ({
  ok: status === HTTP_OK,
  status,
  json: () => Promise.resolve(body)
})

/**
 * Wraps the font API's lookups in a disk cache: a family's description, or the fact the API has
 * no such family, is fetched once and read from disk after.
 * @param fetchJson - Fetches one URL.
 * @param directory - The cache folder.
 * @returns A fetch with the same answers, mostly from disk.
 */
export const createCachingFetch =
  (fetchJson: FontFetch, directory: string): FontFetch =>
  async (url) => {
    const path = join(directory, `${cacheKey(url)}.json`)
    const cached = await readFile(path, 'utf8').catch(() => undefined)
    if (cached !== undefined) {
      const { status, body } = cachedAnswerSchema.parse(JSON.parse(cached))
      return answerFromCache(status, body)
    }
    const response = await fetchJson(url)
    if (response.status !== HTTP_OK && response.status !== HTTP_NOT_FOUND) return response
    const body: unknown = response.ok ? await response.json() : null
    await writeAtomically(path, JSON.stringify({ status: response.status, body }))
    return answerFromCache(response.status, body)
  }

/**
 * Fetches a URL, giving up after a few seconds so a dead host cannot hang a tool.
 * @param url - The address to fetch.
 * @returns The response.
 */
export const fetchWithTimeout: FontFetch = (url) =>
  fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) })

/**
 * Downloads a font file.
 * @param url - The file's address.
 * @returns Its bytes.
 */
export const fetchFontBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) })
  if (!response.ok) throw new Error(`The font file host answered ${response.status} for ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}
