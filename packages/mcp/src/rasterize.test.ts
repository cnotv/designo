import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSvgRasterizer, DEFAULT_RENDER_LIMITS, rasterizeSvgToPng } from './rasterize.ts'

const PNG_SIGNATURE = '89504e470d0a1a0a'
const SQUARE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff0000"/></svg>'

const testWorker = (name: string): string =>
  fileURLToPath(new URL(`./testWorkers/${name}.ts`, import.meta.url))

const rasterizerWith = (workerName: string, limits = {}) =>
  createSvgRasterizer({
    workerPath: testWorker(workerName),
    limits: { ...DEFAULT_RENDER_LIMITS, ...limits }
  })

const expectFailure = (outcome: Awaited<ReturnType<typeof rasterizeSvgToPng>>): string => {
  if (outcome.ok) throw new Error('Expected the render to fail')
  return outcome.message
}

// The editor's test fonts, standing in for the files the font API gives.
const fixtureFont = (name: string): string =>
  fileURLToPath(new URL(`../../text/src/fixtures/${name}`, import.meta.url))

const FONT_FILES = [
  fixtureFont('Inter-Regular.subset.ttf'),
  fixtureFont('NotoSans-Latin.fixture.ttf')
]

const textSvg = (fontFamily: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="60" viewBox="0 0 260 60"><rect width="260" height="60" fill="#ffffff"/><text x="8" y="40" font-family="${fontFamily}" font-size="28" fill="#000000">Handgloves 123</text></svg>`

const drawText = async (fontFamily: string): Promise<string> => {
  const outcome = await rasterizeSvgToPng(textSvg(fontFamily), 1, FONT_FILES)
  if (!outcome.ok) throw new Error(outcome.message)
  return outcome.png.toString('base64')
}

describe('the fonts a screenshot draws with', () => {
  it('draws each family from the font files it is given', async () => {
    const [noto, inter, unknown] = await Promise.all([
      drawText('Noto Sans'),
      drawText('Inter'),
      drawText('No Such Family')
    ])
    expect(noto).not.toBe(inter)
    expect(unknown).toBe(inter)
  })
})

describe('rasterizeSvgToPng', () => {
  it('draws an SVG to a PNG in a child process', async () => {
    const outcome = await rasterizeSvgToPng(SQUARE_SVG, 2, [])
    if (!outcome.ok) throw new Error(outcome.message)
    expect(outcome.png.toString('hex', 0, 8)).toBe(PNG_SIGNATURE)
    expect(outcome.png.readUInt32BE(16)).toBe(200)
  })

  it('answers a render that crashes with an error for that call, and the next call works', async () => {
    const message = expectFailure(await rasterizerWith('crashingWorker')(SQUARE_SVG, 1, []))
    expect(message).toContain('Rendering crashed (SIGABRT)')
    const next = await rasterizeSvgToPng(SQUARE_SVG, 1, [])
    expect(next.ok).toBe(true)
  })

  it('stops a render that takes too long and says how long it was allowed', async () => {
    const started = Date.now()
    const message = expectFailure(
      await rasterizerWith('hangingWorker', { timeoutMilliseconds: 300 })(SQUARE_SVG, 1, [])
    )
    expect(message).toContain('Rendering timed out after 0.3 s')
    expect(Date.now() - started).toBeLessThan(5000)
    expect((await rasterizeSvgToPng(SQUARE_SVG, 1, [])).ok).toBe(true)
  })

  it.skipIf(!existsSync('/proc/self/status'))(
    'stops a render that holds too much memory',
    async () => {
      const message = expectFailure(
        await rasterizerWith('memoryHungryWorker', { maxMemoryBytes: 150 * 1024 * 1024 })(
          SQUARE_SVG,
          1,
          []
        )
      )
      expect(message).toContain('Rendering used more than 150 MB of memory')
    }
  )

  it('refuses a render with more pixels than the limit before drawing it', async () => {
    const rasterize = createSvgRasterizer({
      workerPath: fileURLToPath(new URL('./rasterizeWorker.ts', import.meta.url)),
      limits: { ...DEFAULT_RENDER_LIMITS, maxPixels: 10_000 }
    })
    expect((await rasterize(SQUARE_SVG, 1, [])).ok).toBe(true)
    const message = expectFailure(await rasterize(SQUARE_SVG, 2, []))
    expect(message).toBe(
      'Rendering is too large: 200 x 200 px is 40000 pixels and the limit is 10000 pixels. Lower the scale or render a smaller node.'
    )
  })

  it('reports an SVG the renderer cannot read as a failure with its reason', async () => {
    const message = expectFailure(await rasterizeSvgToPng('<svg><', 1, []))
    expect(message).toMatch(/^rendering failed: .*pars/i)
  })

  it('reports a worker that cannot start', async () => {
    const rasterize = createSvgRasterizer({
      workerPath: '/does/not/exist.ts',
      limits: DEFAULT_RENDER_LIMITS
    })
    expect(expectFailure(await rasterize(SQUARE_SVG, 1, []))).toContain('Rendering failed')
  })
})
