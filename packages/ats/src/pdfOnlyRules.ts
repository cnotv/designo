import type { AtsFinding, PdfFacts } from './types.ts'

const MARGIN_STRIP_RATIO = 0.06
// A symbol or a private-use character on its own is an icon font's glyph, which reads as nothing.
const ICON_PATTERN = /^[\p{So}\p{Co}]{1,2}$/u
const FILE_NAME_TITLE_PATTERN = /\.(?:pdf|docx?|tex|indd|odt|pages)$|^microsoft word - /i

/**
 * Looks for pages with no text at all, which is what a scan or a page saved as a picture is: a
 * reader gets nothing from it.
 * @param facts - What a reader finds in the PDF.
 * @returns A failure for each page without text, or one pass.
 */
export const checkTextLayer = (facts: PdfFacts): AtsFinding[] => {
  const empty = facts.pages.flatMap((page, index): AtsFinding[] =>
    page.items.some((item) => item.text.trim() !== '')
      ? []
      : [
          {
            rule: 'text-layer',
            status: 'fail',
            page: index + 1,
            message: 'No text on this page: it is a scan or a picture, so a parser reads nothing.'
          }
        ]
  )
  return empty.length > 0
    ? empty
    : [{ rule: 'text-layer', status: 'pass', message: 'Every page has a text layer.' }]
}

/**
 * Looks for text in the header or footer strip of a page and for icons standing as words, from the
 * positions in the PDF alone. Text over a picture cannot be seen without the pictures.
 * @param facts - What a reader finds in the PDF.
 * @returns A warning for each page with either, or one pass.
 */
export const checkPdfLayoutTraps = (facts: PdfFacts): AtsFinding[] => {
  const warnings = facts.pages.flatMap((page, index): AtsFinding[] => {
    const items = page.items.filter((item) => item.text.trim() !== '')
    const inStrip = items.filter(
      (item) =>
        item.y <= page.height * MARGIN_STRIP_RATIO ||
        item.y >= page.height * (1 - MARGIN_STRIP_RATIO)
    )
    const icons = items.filter((item) => ICON_PATTERN.test(item.text.trim()))
    return [
      ...(inStrip.length > 0
        ? [
            {
              rule: 'layout-traps',
              status: 'warn' as const,
              page: index + 1,
              message: `${inStrip.length} text strings sit in the header or footer strip, which many parsers skip.`
            }
          ]
        : []),
      ...(icons.length > 0
        ? [
            {
              rule: 'layout-traps',
              status: 'warn' as const,
              page: index + 1,
              message: `${icons.length} icons stand where a word is expected, and read as nothing or as a stray character.`
            }
          ]
        : [])
    ]
  })
  return warnings.length > 0
    ? warnings
    : [
        {
          rule: 'layout-traps',
          status: 'pass',
          message: 'No text in the header or footer strip and no icons as words.'
        }
      ]
}

/**
 * Checks the title, the author and the language the PDF carries. A title that is a file name, or
 * that the program that wrote the file filled in, is not one.
 * @param facts - What a reader finds in the PDF.
 * @returns A warning for each missing field, or one pass.
 */
export const checkPdfMetadata = (facts: PdfFacts): AtsFinding[] => {
  const hasTitle = Boolean(facts.title?.trim()) && !FILE_NAME_TITLE_PATTERN.test(facts.title ?? '')
  const missing = [
    ...(hasTitle ? [] : ['title (empty, or a file name)']),
    ...(facts.author ? [] : ['author']),
    ...(facts.language ? [] : ['language'])
  ]
  return missing.length === 0
    ? [{ rule: 'metadata', status: 'pass', message: 'Title, author and language are set.' }]
    : missing.map((field): AtsFinding => ({
        rule: 'metadata',
        status: 'warn',
        message: `The PDF has no ${field}.`
      }))
}

/**
 * Checks that each link annotation has its text drawn where it is.
 * @param facts - What a reader finds in the PDF.
 * @returns A warning for each link with no visible text, or one pass.
 */
export const checkPdfLinks = (facts: PdfFacts): AtsFinding[] => {
  const hidden = facts.links
    .filter((link) => link.visibleText.trim() === '')
    .map((link): AtsFinding => ({
      rule: 'links',
      status: 'warn',
      page: link.page,
      message: `The link to ${link.url} has no visible text, so a reader that lists link text shows nothing.`
    }))
  return hidden.length > 0
    ? hidden
    : [
        {
          rule: 'links',
          status: 'pass',
          message:
            facts.links.length === 0
              ? 'The PDF has no links.'
              : `${facts.links.length} links, each with visible text.`
        }
      ]
}
