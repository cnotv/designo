import type { DesignDocument } from '@designo/core'
import { checkFonts, checkLinks, checkMetadata } from './fileRules.ts'
import { checkLayoutTraps } from './layoutRules.ts'
import { getPageLines } from './lines.ts'
import {
  checkPdfLayoutTraps,
  checkPdfLinks,
  checkPdfMetadata,
  checkPdfTextExtraction,
  checkTextLayer
} from './pdfOnlyRules.ts'
import { getPlacedNodes } from './scope.ts'
import { checkContactDetails, checkReadingOrder, checkSectionHeadings } from './structureRules.ts'
import { checkTextExtraction } from './textRules.ts'
import type { AtsReport, PdfFacts } from './types.ts'

/** Names the reader and the rules, because the report is not what a real ATS would say. */
export const ATS_PARSER = 'Designo ATS rules v1, text read with pdf.js'

const buildReport = (
  findings: AtsReport['findings'],
  notChecked: AtsReport['notChecked'],
  facts: PdfFacts
): AtsReport => {
  const count = (status: 'pass' | 'warn' | 'fail'): number =>
    findings.filter((finding) => finding.status === status).length
  return {
    parser: ATS_PARSER,
    summary: { pass: count('pass'), warn: count('warn'), fail: count('fail') },
    findings,
    notChecked,
    readingOrder: facts.pages.map((page) => getPageLines(page).map((line) => line.text))
  }
}

/**
 * Runs every ATS rule over an exported document and what a reader finds in its PDF.
 * @param document - The exported document, with its master pages resolved.
 * @param facts - What a reader finds in the PDF.
 * @returns Each finding as pass, warn or fail, a count of each, and the text in reading order.
 */
export const checkAts = (document: DesignDocument, facts: PdfFacts): AtsReport => {
  const placedNodes = getPlacedNodes(document)
  return buildReport(
    [
      ...checkTextExtraction(placedNodes, facts),
      ...checkFonts(facts),
      ...checkReadingOrder(facts),
      ...checkContactDetails(facts),
      ...checkSectionHeadings(facts),
      ...checkLayoutTraps(placedNodes),
      ...checkMetadata(document, facts),
      ...checkLinks(placedNodes, facts)
    ],
    [],
    facts
  )
}

const NOT_CHECKED_WITHOUT_DOCUMENT: AtsReport['notChecked'] = [
  {
    rule: 'selectable-text',
    reason:
      'Which texts of a design were flattened to images needs the design. text-layer and the scan check read the PDF itself.'
  }
]

/**
 * Runs the ATS rules that need only a PDF, for one made by another program. Rules that need the
 * document it came from are listed in `notChecked` and are not reported as passed.
 * @param facts - What a reader finds in the PDF.
 * @returns The report, with the rules it could not run.
 */
export const checkPdfAts = (facts: PdfFacts): AtsReport =>
  buildReport(
    [
      ...checkTextLayer(facts),
      ...checkPdfTextExtraction(facts),
      ...checkFonts(facts),
      ...checkReadingOrder(facts),
      ...checkContactDetails(facts),
      ...checkSectionHeadings(facts),
      ...checkPdfLayoutTraps(facts),
      ...checkPdfMetadata(facts),
      ...checkPdfLinks(facts)
    ],
    NOT_CHECKED_WITHOUT_DOCUMENT,
    facts
  )
