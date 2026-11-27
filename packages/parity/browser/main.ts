// Runs in headless Chromium: draws a case with the editor's WebGL renderer, and a PDF with pdf.js,
// and hands the pixels back to the Node runner.
import { createSceneSource, buildScene } from '@designo/editor/src/rendering/scene.ts'
import { createWebglRenderer } from '@designo/editor/src/rendering/webgl/webglRenderer.ts'
import { indexDocument } from '@designo/editor/src/editing/spatialIndex.ts'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createParityCases } from '../src/cases.ts'
import type { ParityCase } from '../src/types.ts'
import type { BrowserImage } from './types.ts'

// pdf.js reads the worker's address from one global; there is no per-call option for it.
Reflect.set(GlobalWorkerOptions, 'workerSrc', workerSource)

const VIEWPORT = { offsetX: 0, offsetY: 0, scale: 1 }

const findCase = (name: string): ParityCase => {
  const found = createParityCases().find((parityCase) => parityCase.name === name)
  if (!found) throw new Error(`No parity case is named ${name}`)
  return found
}

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  document.body.append(canvas)
  return canvas
}

// Read in the same task as the draw, so the drawing buffer has not been cleared for the next frame.
const readPixels = (source: HTMLCanvasElement, width: number, height: number): BrowserImage => {
  const copy = createCanvas(width, height).getContext('2d')
  if (!copy) throw new Error('No 2D context to read the pixels with')
  copy.drawImage(source, 0, 0, width, height)
  return { width, height, pixels: [...copy.getImageData(0, 0, width, height).data] }
}

const renderWebgl = (name: string): BrowserImage => {
  const parityCase = findCase(name)
  const frame = parityCase.document.nodes[parityCase.frameId]
  if (!frame) throw new Error(`The ${name} case has no frame`)
  const size = { width: frame.width, height: frame.height }
  const canvas = createCanvas(size.width, size.height)
  const renderer = createWebglRenderer(canvas)
  if (!renderer) throw new Error('WebGL2 is not available in this browser')
  const source = createSceneSource(parityCase.document, indexDocument(parityCase.document))
  renderer.render({
    items: buildScene(source, VIEWPORT, size),
    viewport: VIEWPORT,
    size,
    pixelRatio: 1
  })
  const image = readPixels(canvas, size.width, size.height)
  renderer.dispose()
  return image
}

const renderPdf = async (bytes: readonly number[]): Promise<BrowserImage> => {
  const loading = getDocument({ data: Uint8Array.from(bytes) })
  const pdf = await loading.promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  const width = Math.round(viewport.width)
  const height = Math.round(viewport.height)
  const canvas = createCanvas(width, height)
  await page.render({ canvas, viewport }).promise
  const image = readPixels(canvas, width, height)
  await loading.destroy()
  return image
}

Reflect.set(window, 'designoParity', { renderWebgl, renderPdf })
