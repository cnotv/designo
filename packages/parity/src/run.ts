// Draws every parity case three ways and fails when the WebGL or PDF drawing drifts from resvg.
// Writes the images, their differences and a report to PARITY_OUT, `report` by default.
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openBrowserSession, type BrowserSession } from './browserSession.ts'
import { createParityCases } from './cases.ts'
import { compareImages, compositeOverWhite, isWithinTolerance } from './compare.ts'
import { encodePng } from './png.ts'
import { exportCasePdf, renderSvgReference } from './references.ts'
import { buildHtmlReport, buildMarkdownSummary, isParityRunPassing } from './report.ts'
import { PARITY_TOLERANCES } from './tolerances.ts'
import type {
  CaseResult,
  ComparedRenderer,
  ParityCase,
  RendererResult,
  RgbaImage
} from './types.ts'

const outputDirectory = path.resolve(process.env.PARITY_OUT ?? 'report')

const writeImage = (caseName: string, fileName: string, image: RgbaImage): Promise<void> =>
  writeFile(path.join(outputDirectory, caseName, `${fileName}.png`), encodePng(image))

const compareRenderer = async (
  parityCase: ParityCase,
  renderer: ComparedRenderer,
  reference: RgbaImage,
  drawn: RgbaImage
): Promise<RendererResult> => {
  const tolerance = PARITY_TOLERANCES[renderer]
  const image = compositeOverWhite(drawn)
  const comparison = compareImages(reference, image, tolerance)
  await writeImage(parityCase.name, renderer, image)
  await writeImage(parityCase.name, `${renderer}-diff`, comparison.diffImage)
  return { renderer, comparison, tolerance, passed: isWithinTolerance(comparison, tolerance) }
}

const runCase = async (session: BrowserSession, parityCase: ParityCase): Promise<CaseResult> => {
  await mkdir(path.join(outputDirectory, parityCase.name), { recursive: true })
  const reference = compositeOverWhite(renderSvgReference(parityCase))
  await writeImage(parityCase.name, 'reference', reference)
  const webgl = await session.renderWebgl(parityCase.name)
  const pdf = await session.renderPdf(await exportCasePdf(parityCase))
  return {
    name: parityCase.name,
    description: parityCase.description,
    results: [
      await compareRenderer(parityCase, 'webgl', reference, webgl),
      await compareRenderer(parityCase, 'pdf', reference, pdf)
    ]
  }
}

const runCases = (session: BrowserSession): Promise<CaseResult[]> =>
  // One after another: the page draws on one WebGL context at a time.
  createParityCases().reduce<Promise<CaseResult[]>>(
    async (done, parityCase) => [...(await done), await runCase(session, parityCase)],
    Promise.resolve([])
  )

const session = await openBrowserSession()
const cases = await runCases(session).finally(session.close)
const summary = buildMarkdownSummary(cases)
await writeFile(path.join(outputDirectory, 'index.html'), buildHtmlReport(cases))
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Render parity\n\n${summary}\n`)
process.stdout.write(`${summary}\n\nReport: ${path.join(outputDirectory, 'index.html')}\n`)
process.exit(isParityRunPassing(cases) ? 0 : 1)
