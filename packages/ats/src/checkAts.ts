import type { DesignDocument } from '@designo/core'
import { checkFonts, checkLinks, checkMetadata } from './fileRules.ts'
import { checkLayoutTraps } from './layoutRules.ts'
import { getPageLines } from './lines.ts'
import { getPlacedNodes } from './scope.ts'
import { checkContactDetails, checkReadingOrder, checkSectionHeadings } from './structureRules.ts'
import { checkTextExtraction } from './textRules.ts'
import type { AtsReport, PdfFacts } from './types.ts'

/** Names the reader and the rules, because the report is not what a real ATS would say. */
export const ATS_PARSER = 'Designo ATS rules v1, text read with pdf.js'

/**
 * Runs every ATS rule over an exported document and what a reader finds in its PDF.
 * @param document - The exported document, with its master pages resolved.
 * @param facts - What a reader finds in the PDF.
 * @returns Each finding as pass, warn or fail, a count of each, and the text in reading order.
 */
export const checkAts = (document: DesignDocument, facts: PdfFacts): AtsReport => {
  const placedNodes = getPlacedNodes(document)
  const findings = [
    ...checkTextExtraction(placedNodes, facts),
    ...checkFonts(facts),
    ...checkReadingOrder(facts),
    ...checkContactDetails(facts),
    ...checkSectionHeadings(facts),
    ...checkLayoutTraps(placedNodes),
    ...checkMetadata(document, facts),
    ...checkLinks(placedNodes, facts)
  ]
  const count = (status: 'pass' | 'warn' | 'fail'): number =>
    findings.filter((finding) => finding.status === status).length
  return {
    parser: ATS_PARSER,
    summary: { pass: count('pass'), warn: count('warn'), fail: count('fail') },
    findings,
    readingOrder: facts.pages.map((page) => getPageLines(page).map((line) => line.text))
  }
}
