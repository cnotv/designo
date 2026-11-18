// Run by `node` as a child process for every screenshot: SVG on stdin, PNG on stdout. resvg is
// native code that aborts the whole process on some inputs, so it never runs in the server itself.
import { text } from 'node:stream/consumers'
import { Resvg } from '@resvg/resvg-js'
import { EXIT_FAILED, EXIT_TOO_LARGE } from './workerProtocol.ts'

const [scaleArgument = '1', maxPixelsArgument = '0'] = process.argv.slice(2)
const scale = Number(scaleArgument)
const maxPixels = Number(maxPixelsArgument)

const fail = (message: string): never => {
  process.stderr.write(message)
  return process.exit(EXIT_FAILED)
}

const renderPng = (svg: string): Buffer => {
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true }
  })
  const width = Math.ceil(renderer.width * scale)
  const height = Math.ceil(renderer.height * scale)
  if (width * height > maxPixels) {
    process.stderr.write(`${width}x${height}`)
    process.exit(EXIT_TOO_LARGE)
  }
  return renderer.render().asPng()
}

try {
  process.stdout.write(renderPng(await text(process.stdin)))
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
