import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeLayoutText } from './textLayout.ts'

const INTER = await readFile(
  new URL('../../text/src/fixtures/Inter-Regular.subset.ttf', import.meta.url)
)

const inter = {
  id: 'inter',
  family: 'Inter',
  subsets: ['all'],
  weights: [400],
  styles: ['normal'],
  unicodeRange: { all: 'U+0000-04FF' },
  variants: { '400': { normal: { all: { url: { ttf: 'https://fonts.test/inter.ttf' } } } } }
}

const answer = (status: number, body: unknown = null) => ({
  ok: status === 200,
  status,
  json: () => Promise.resolve(body)
})

let parent: string

beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), 'designo-layout-'))
})

afterEach(async () => {
  await rm(parent, { recursive: true, force: true })
})

describe('createNodeLayoutText', () => {
  // The cache folder does not exist before the first layout, and it must not stop that layout.
  it('lays text out with fonts from the font API, into a cache folder it creates', async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array(INTER))
    const layoutText = createNodeLayoutText({
      fetchJson: async (url) => (url.endsWith('/inter') ? answer(200, inter) : answer(404)),
      fetchBytes,
      cacheDirectory: path.join(parent, 'not-yet')
    })
    const request = {
      text: 'one two three four',
      fontFamily: 'Inter',
      fontSize: 20,
      lineHeight: 1.2,
      alignment: 'left' as const,
      wrapWidth: 80
    }
    expect((await layoutText(request))?.lines.length).toBeGreaterThan(1)
    expect((await layoutText({ ...request, text: 'again' }))?.lines).toHaveLength(1)
    expect(fetchBytes).toHaveBeenCalledTimes(1)
  })
})
