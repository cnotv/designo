import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buffer, text } from 'node:stream/consumers'
import { EXIT_TOO_LARGE } from './workerProtocol.ts'
import type { RasterizeOutcome, Rasterize, RasterizerOptions, RenderLimits } from './types.ts'

/** Lower and upper bounds keep a request from asking for a gigantic bitmap. */
export const MIN_SCREENSHOT_SCALE = 0.1
export const MAX_SCREENSHOT_SCALE = 4

const BYTES_PER_KILOBYTE = 1024
const MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE
const MEGAPIXEL = 1_000_000
const MILLISECONDS_PER_SECOND = 1000
const MEMORY_POLL_MILLISECONDS = 50
const MAX_REASON_CHARACTERS = 300
const DEFAULT_TIMEOUT_MILLISECONDS = 20_000
const DEFAULT_MAX_MEGAPIXELS = 64
const DEFAULT_MAX_MEMORY_MEGABYTES = 1024

/** What a render may cost: about 9 bytes per pixel and 33 ms per megapixel (57 megapixels measured 520 MB and 1.9 s). */
export const DEFAULT_RENDER_LIMITS: RenderLimits = {
  timeoutMilliseconds: DEFAULT_TIMEOUT_MILLISECONDS,
  maxPixels: DEFAULT_MAX_MEGAPIXELS * MEGAPIXEL,
  maxMemoryBytes: DEFAULT_MAX_MEMORY_MEGABYTES * MEGABYTE
}

type StopReason = 'timeout' | 'memory'

const clampScale = (scale: number): number =>
  Math.min(MAX_SCREENSHOT_SCALE, Math.max(MIN_SCREENSHOT_SCALE, scale))

const failure = (message: string): RasterizeOutcome => ({ ok: false, message })

// Linux only: elsewhere there is no /proc and the pixel limit alone bounds the memory.
const readResidentBytes = async (processId: number): Promise<number | undefined> => {
  const status = await readFile(`/proc/${processId}/status`, 'utf8').catch(() => '')
  const kilobytes = /^VmRSS:\s+(\d+) kB/m.exec(status)?.[1]
  return kilobytes === undefined ? undefined : Number(kilobytes) * BYTES_PER_KILOBYTE
}

/**
 * Kills the worker when it runs too long or holds too much memory, and remembers which.
 * @param worker - The running render process.
 * @param limits - The time and memory it may use.
 * @returns What stopped it, if anything, and a function that ends the watching.
 */
const guardWorker = (
  worker: ChildProcess,
  limits: RenderLimits
): { stoppedBecause: () => StopReason | undefined; release: () => void } => {
  let reason: StopReason | undefined
  const stop = (why: StopReason): void => {
    reason ??= why
    worker.kill('SIGKILL')
  }
  const timer = setTimeout(() => stop('timeout'), limits.timeoutMilliseconds)
  const poller = setInterval(() => {
    if (worker.pid === undefined) return
    void readResidentBytes(worker.pid).then((bytes) => {
      if (bytes !== undefined && bytes > limits.maxMemoryBytes) stop('memory')
    })
  }, MEMORY_POLL_MILLISECONDS)
  return {
    stoppedBecause: () => reason,
    release: () => {
      clearTimeout(timer)
      clearInterval(poller)
    }
  }
}

const describeStop = (reason: StopReason, limits: RenderLimits): string =>
  reason === 'timeout'
    ? `Rendering timed out after ${limits.timeoutMilliseconds / MILLISECONDS_PER_SECOND} s and was stopped. Try a smaller node or a lower scale.`
    : `Rendering used more than ${Math.round(limits.maxMemoryBytes / MEGABYTE)} MB of memory and was stopped. Try a smaller node or a lower scale.`

const formatPixelCount = (pixels: number): string =>
  pixels >= MEGAPIXEL ? `${Math.round(pixels / MEGAPIXEL)} megapixels` : `${pixels} pixels`

const describeTooLarge = (size: string, limits: RenderLimits): string => {
  const [width = 0, height = 0] = size.split('x').map(Number)
  return `Rendering is too large: ${width} x ${height} px is ${formatPixelCount(width * height)} and the limit is ${formatPixelCount(limits.maxPixels)}. Lower the scale or render a smaller node.`
}

const interpretExit = (
  exit: { code: number | null; signal: NodeJS.Signals | null },
  png: Buffer,
  errorText: string,
  limits: RenderLimits
): RasterizeOutcome => {
  if (exit.signal !== null) {
    return failure(
      `Rendering crashed (${exit.signal}). The renderer runs in its own process, so the server is fine. Try a smaller node or another scale.`
    )
  }
  if (exit.code === 0) return { ok: true, png }
  if (exit.code === EXIT_TOO_LARGE) return failure(describeTooLarge(errorText, limits))
  const reason = errorText.trim().slice(0, MAX_REASON_CHARACTERS)
  return failure(
    `Rendering failed: ${reason === '' ? `the renderer exited with code ${exit.code}` : reason}`
  )
}

/**
 * Builds a rasterizer that draws each SVG in a fresh child process: a crash, a hang or a render
 * that is too big ends that one call with an explanation and leaves the server running.
 * @param options - The worker script and the limits it must stay within.
 * @returns A function from SVG and scale to a PNG or an explanation of why there is none.
 */
export const createSvgRasterizer =
  (options: RasterizerOptions): Rasterize =>
  async (svg, scale) => {
    // An empty environment: the worker needs nothing from the server's, which holds secrets.
    const worker = spawn(
      process.execPath,
      [
        '--no-warnings',
        options.workerPath,
        String(clampScale(scale)),
        String(options.limits.maxPixels)
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], env: {} }
    )
    const guard = guardWorker(worker, options.limits)
    // The worker may die before it has read the SVG; that surfaces as its exit, not as a write error.
    worker.stdin.on('error', () => undefined)
    worker.stdin.end(svg)
    try {
      const [png, errorText, [code, signal]] = await Promise.all([
        buffer(worker.stdout),
        text(worker.stderr),
        once(worker, 'close') as Promise<[number | null, NodeJS.Signals | null]>
      ])
      const stopped = guard.stoppedBecause()
      return stopped === undefined
        ? interpretExit({ code, signal }, png, errorText, options.limits)
        : failure(describeStop(stopped, options.limits))
    } catch (error) {
      return failure(
        `Rendering could not start: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      guard.release()
    }
  }

const WORKER_PATH = fileURLToPath(new URL('./rasterizeWorker.ts', import.meta.url))

/** Rasterizes SVG text to PNG bytes in a child process, within {@link DEFAULT_RENDER_LIMITS}. */
export const rasterizeSvgToPng: Rasterize = createSvgRasterizer({
  workerPath: WORKER_PATH,
  limits: DEFAULT_RENDER_LIMITS
})
