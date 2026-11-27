import { GlobalWorkerOptions, OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readPageOperators } from './pageOperators.ts'
import type { PdfFacts, PdfFontFacts, PdfLinkFacts, PdfPageFacts, PdfTextItem } from './types.ts'

const OPERATOR_CODES = {
  save: OPS.save,
  restore: OPS.restore,
  transform: OPS.transform,
  paintFormXObjectBegin: OPS.paintFormXObjectBegin,
  paintFormXObjectEnd: OPS.paintFormXObjectEnd,
  setTextRenderingMode: OPS.setTextRenderingMode,
  imageOperators: [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]
}

const OBJECT_PATTERN = /\d+ \d+ obj([\S\s]*?)endobj/g

// Font dictionaries are plain text in the file, so what a reader needs of them is read there:
// pdf.js would load the font programs, which is more than a check needs.
const readFonts = (bytes: Uint8Array): PdfFontFacts[] => {
  const objects = [...new TextDecoder('latin1').decode(bytes).matchAll(OBJECT_PATTERN)].map(
    (match) => match[1] ?? ''
  )
  const embeddedNames = new Set(
    objects.flatMap((object) =>
      /\/FontFile[23]?\b/.test(object) ? [/\/FontName\s*\/(\S+)/.exec(object)?.[1] ?? ''] : []
    )
  )
  return objects.flatMap((object) => {
    const name = /\/BaseFont\s*\/(\S+)/.exec(object)?.[1]
    return name && /\/Type\s*\/Font\b/.test(object) && !/\/Subtype\s*\/CIDFontType/.test(object)
      ? [{ name, embedded: embeddedNames.has(name), hasUnicodeMap: /\/ToUnicode\b/.test(object) }]
      : []
  })
}

/**
 * Reads an exported PDF the way a parser built on pdf.js does, and collects what the ATS rules
 * need: positioned text, fonts, metadata and links.
 * @param bytes - The PDF.
 * @param workerSource - Where a browser loads pdf.js's worker from; Node needs none.
 * @returns What a reader finds in the file.
 */
export const extractPdfFacts = async (
  bytes: Uint8Array,
  workerSource?: string
): Promise<PdfFacts> => {
  // pdf.js reads the worker's address from one global; there is no per-call option for it.
  if (workerSource) Reflect.set(GlobalWorkerOptions, 'workerSrc', workerSource)
  const pdf = await getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false }).promise
  const metadata = await pdf.getMetadata()
  const info = metadata.info as Record<string, string | undefined>
  const pageNumbers = Array.from({ length: pdf.numPages }, (_unused, index) => index + 1)
  const pages = await Promise.all(
    pageNumbers.map(async (pageNumber) => {
      const page = await pdf.getPage(pageNumber)
      const { width, height } = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = content.items.flatMap((item): PdfTextItem[] =>
        'str' in item
          ? [
              {
                text: item.str,
                x: item.transform[4] ?? 0,
                y: height - (item.transform[5] ?? 0),
                width: item.width,
                height: item.height
              }
            ]
          : []
      )
      const drawing = readPageOperators(await page.getOperatorList(), OPERATOR_CODES, height)
      const links = (await page.getAnnotations())
        .filter((annotation) => annotation.subtype === 'Link' && annotation.url)
        .map((annotation): PdfLinkFacts => {
          const [left = 0, bottom = 0, right = 0, top = 0] = annotation.rect
          return {
            page: pageNumber,
            url: annotation.url,
            visibleText: items
              .filter((item) => {
                const centreX = item.x + item.width / 2
                const baselineY = height - item.y
                return (
                  centreX >= left && centreX <= right && baselineY >= bottom && baselineY <= top
                )
              })
              .map((item) => item.text)
              .join(' ')
          }
        })
      return { facts: { width, height, items, ...drawing } satisfies PdfPageFacts, links }
    })
  )
  return {
    pages: pages.map((page) => page.facts),
    fonts: readFonts(bytes),
    links: pages.flatMap((page) => page.links),
    ...(info['Title'] ? { title: info['Title'] } : {}),
    ...(info['Author'] ? { author: info['Author'] } : {}),
    ...(info['Language'] ? { language: info['Language'] } : {})
  }
}
