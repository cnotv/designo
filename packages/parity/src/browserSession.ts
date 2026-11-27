import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import type { BrowserImage } from '../browser/types.ts'
import type { RgbaImage } from './types.ts'

const BROWSER_ROOT = fileURLToPath(new URL('../browser', import.meta.url))
const WORKSPACE_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

// SwiftShader gives headless Chromium a WebGL2 context with no GPU, as on a CI runner.
const CHROMIUM_ARGUMENTS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']

/** Draws cases in headless Chromium, with the parity page served by Vite. */
export interface BrowserSession {
  renderWebgl: (caseName: string) => Promise<RgbaImage>
  renderPdf: (pdfBytes: Uint8Array) => Promise<RgbaImage>
  close: () => Promise<void>
}

const toRgbaImage = (image: BrowserImage): RgbaImage => ({
  width: image.width,
  height: image.height,
  pixels: Uint8Array.from(image.pixels)
})

/**
 * Serves the parity page and opens it in headless Chromium.
 * @returns The two browser renderers, and a function that closes the browser and the server.
 */
export const openBrowserSession = async (): Promise<BrowserSession> => {
  const server = await createServer({
    root: BROWSER_ROOT,
    configFile: false,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [WORKSPACE_ROOT] } },
    // As in the editor: pre-bundling would move harfbuzzjs away from its .wasm file.
    optimizeDeps: { exclude: ['harfbuzzjs'] }
  })
  await server.listen()
  const address = server.resolvedUrls?.local[0]
  const browser = await chromium.launch({
    args: CHROMIUM_ARGUMENTS,
    ...(process.env.PARITY_CHROMIUM ? { executablePath: process.env.PARITY_CHROMIUM } : {})
  })
  const close = async (): Promise<void> => {
    await browser.close()
    await server.close()
  }
  if (!address) {
    await close()
    throw new Error('Vite did not report the address it serves on')
  }
  const page = await browser.newPage()
  await page.goto(address)
  await page.waitForFunction(() => Reflect.has(window, 'designoParity'))
  return {
    renderWebgl: async (caseName) =>
      toRgbaImage(await page.evaluate((name) => window.designoParity.renderWebgl(name), caseName)),
    renderPdf: async (pdfBytes) =>
      toRgbaImage(
        await page.evaluate((bytes) => window.designoParity.renderPdf(bytes), [...pdfBytes])
      ),
    close
  }
}
