import { getPageLines, type PageLine } from './lines.ts'
import type { AtsFinding, PdfFacts } from './types.ts'

const MIN_COLUMN_ROWS = 3
const MIN_TABLE_CELLS = 3
const CONTACT_LINE_COUNT = 8
const EMAIL_PATTERN = /[\w+.-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE_PATTERN = /\+?\d[\d\s().-]{5,}\d/
const NAME_PATTERN = /^\p{Lu}[\p{L}'.-]+(?:\s+\p{Lu}[\p{L}'.-]+){1,3}$/u

const SECTION_HEADINGS: Record<string, readonly string[]> = {
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment',
    'work history'
  ],
  education: ['education', 'education and training', 'academic background'],
  skills: ['skills', 'technical skills', 'key skills', 'core skills'],
  summary: ['summary', 'profile', 'professional summary', 'about me', 'objective']
}
const REQUIRED_SECTIONS = ['experience', 'education', 'skills']

const hasTableRun = (lines: readonly PageLine[]): boolean =>
  lines.some(
    (_line, index) =>
      lines.length - index >= MIN_COLUMN_ROWS &&
      lines
        .slice(index, index + MIN_COLUMN_ROWS)
        .every((row) => row.cells.length >= MIN_TABLE_CELLS)
  )

/**
 * Looks for layouts a single-column reader reads out of order: pages where several rows hold more
 * than one block of text side by side, and rows of three or more cells, which are a table.
 * @param facts - What a reader finds in the PDF.
 * @returns A warning for each page with columns or a table, else one pass.
 */
export const checkReadingOrder = (facts: PdfFacts): AtsFinding[] => {
  const warnings = facts.pages.flatMap((page, index): AtsFinding[] => {
    const lines = getPageLines(page)
    if (hasTableRun(lines))
      return [
        {
          rule: 'reading-order',
          status: 'warn',
          page: index + 1,
          message:
            'Rows of three or more cells look like a table, which many parsers read cell by cell or drop.'
        }
      ]
    return lines.filter((line) => line.cells.length > 1).length >= MIN_COLUMN_ROWS
      ? [
          {
            rule: 'reading-order',
            status: 'warn',
            page: index + 1,
            message:
              'More than one column: a single-column reader joins the rows across the page, so the columns interleave.'
          }
        ]
      : []
  })
  return warnings.length > 0
    ? warnings
    : [{ rule: 'reading-order', status: 'pass', message: 'Every page reads as one column.' }]
}

/**
 * Looks for an email, a phone number and a name in the first rows of the first page, where
 * parsers look for them.
 * @param facts - What a reader finds in the PDF.
 * @returns One finding naming what is missing, or a pass.
 */
export const checkContactDetails = (facts: PdfFacts): AtsFinding[] => {
  const first = facts.pages[0]
  const lines = (first ? getPageLines(first) : []).slice(0, CONTACT_LINE_COUNT)
  const cells = lines.flatMap((line) => line.cells)
  const found: Record<string, boolean> = {
    name: cells.some((cell) => NAME_PATTERN.test(cell)),
    email: lines.some((line) => EMAIL_PATTERN.test(line.text)),
    phone: lines.some((line) => PHONE_PATTERN.test(line.text))
  }
  const missing = Object.keys(found).filter((key) => !found[key])
  return [
    missing.length === 0
      ? {
          rule: 'contact-details',
          status: 'pass',
          page: 1,
          message: 'A name, an email and a phone number are in the first lines.'
        }
      : {
          rule: 'contact-details',
          status: 'warn',
          page: 1,
          message: `Not found in the first ${CONTACT_LINE_COUNT} lines of page 1: ${missing.join(', ')}.`
        }
  ]
}

/**
 * Looks for the common section headings as lines of plain text.
 * @param facts - What a reader finds in the PDF.
 * @returns One finding listing the sections that are missing, or a pass.
 */
export const checkSectionHeadings = (facts: PdfFacts): AtsFinding[] => {
  const lineTexts = new Set(
    facts.pages.flatMap((page) =>
      getPageLines(page).flatMap((line) =>
        line.cells.map((cell) => cell.toLowerCase().replace(/[\s:]+$/, ''))
      )
    )
  )
  const missing = REQUIRED_SECTIONS.filter(
    (section) => !(SECTION_HEADINGS[section] ?? []).some((heading) => lineTexts.has(heading))
  )
  return [
    missing.length === 0
      ? {
          rule: 'section-headings',
          status: 'pass',
          message: 'Experience, education and skills headings are plain text lines.'
        }
      : {
          rule: 'section-headings',
          status: 'warn',
          message: `No plain text heading for: ${missing.join(', ')}.`
        }
  ]
}
