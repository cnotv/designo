import type { AtsFinding, PdfFacts, PdfPageFacts, PdfTextItem } from './types.ts'

const MARGIN_STRIP_RATIO = 0.06
// A symbol or a private-use character on its own is an icon font's glyph, which reads as nothing.
const ICON_PATTERN = /^[\p{So}\p{Co}]{1,2}$/u
const FILE_NAME_TITLE_PATTERN = /\.(?:pdf|docx?|tex|indd|odt|pages)$|^microsoft word - /i

const FULL_PAGE_RATIO = 0.8

const coversPage = (page: PdfPageFacts): boolean =>
  (page.images ?? []).some(
    (image) => image.width * image.height >= page.width * page.height * FULL_PAGE_RATIO
  )

/**
 * Looks for pages a parser can get little from: none with no text at all, which is a scan or a
 * page saved as a picture, and none whose text is an invisible layer over a picture of the page,
 * which is what a scan with OCR looks like and which parsers read badly.
 * @param facts - What a reader finds in the PDF.
 * @returns A finding for each such page, or one pass.
 */
export const checkTextLayer = (facts: PdfFacts): AtsFinding[] => {
  const problems = facts.pages.flatMap((page, index): AtsFinding[] => {
    const hasText = page.items.some((item) => item.text.trim() !== '')
    if (!hasText)
      return [
        {
          rule: 'text-layer',
          status: 'fail',
          page: index + 1,
          message: 'No text on this page: it is a scan or a picture, so a parser reads nothing.'
        }
      ]
    return page.hasInvisibleText && coversPage(page)
      ? [
          {
            rule: 'text-layer',
            status: 'warn',
            page: index + 1,
            message:
              'The text is an invisible layer over a picture of the page, as in a scan with OCR. Parsers read it in the order the scanner guessed, often with errors.'
          }
        ]
      : []
  })
  return problems.length > 0
    ? problems
    : [{ rule: 'text-layer', status: 'pass', message: 'Every page has a real text layer.' }]
}

// Line breaks and tabs are ordinary; any other control or private-use character is not a letter.
const GARBLED_PATTERN = /[\p{Cc}\p{Co}\uFFFD]/u
const ORDINARY_CONTROL_PATTERN = /[\t\n\r]/g
const MIN_WORD_GAP_RATIO = 0.2
const WORD_GAP_LIMIT_RATIO = 0.06
const BACKWARD_JUMP_LINES = 2
const MIN_BACKWARD_JUMPS = 3

const isBlank = (item: PdfTextItem): boolean => item.text.trim() === ''

// Two strings a word space apart with no space between them are glued by a parser that does not
// add the missing space itself.
const countGluedWords = (page: PdfPageFacts): number => {
  const ordered = page.items.toSorted((first, second) => first.y - second.y || first.x - second.x)
  return ordered.filter((item, index) => {
    const previous = ordered[index - 1]
    if (!previous || isBlank(previous) || isBlank(item)) return false
    const sameRow = Math.abs(previous.y - item.y) <= Math.min(previous.height, item.height) / 2
    const gap = item.x - (previous.x + previous.width)
    return (
      sameRow &&
      gap >= previous.height * MIN_WORD_GAP_RATIO &&
      gap < page.width * WORD_GAP_LIMIT_RATIO &&
      !/\s$/.test(previous.text) &&
      !/^\s/.test(item.text)
    )
  }).length
}

// The file draws text in one order and a reader that follows it gets that order, whatever the eye
// sees. A column break is one jump back up; three or more mean the order is scrambled.
const countBackwardJumps = (page: PdfPageFacts): number => {
  const drawn = page.items.filter((item) => !isBlank(item))
  return drawn.filter((item, index) => {
    const previous = drawn[index - 1]
    return previous !== undefined && previous.y - item.y > item.height * BACKWARD_JUMP_LINES
  }).length
}

/**
 * Looks in the PDF alone for what makes a parser return the wrong words: letters its Unicode map
 * lost, spaces that are only a gap, and text drawn in an order that is not the reading order.
 * @param facts - What a reader finds in the PDF.
 * @returns A warning for each page with a problem, or one pass.
 */
export const checkPdfTextExtraction = (facts: PdfFacts): AtsFinding[] => {
  const warnings = facts.pages.flatMap((page, index): AtsFinding[] => {
    const place = { rule: 'text-extraction', status: 'warn' as const, page: index + 1 }
    const garbled = page.items.filter((item) =>
      GARBLED_PATTERN.test(item.text.replaceAll(ORDINARY_CONTROL_PATTERN, ''))
    ).length
    const glued = countGluedWords(page)
    return [
      ...(garbled > 0
        ? [
            {
              ...place,
              message: `${garbled} text strings hold characters with no Unicode value, so a parser returns symbols or nothing for them.`
            }
          ]
        : []),
      ...(glued > 0
        ? [
            {
              ...place,
              message: `${glued} words are separated by a gap with no space character; a parser that does not add the space reads them as one word.`
            }
          ]
        : []),
      ...(countBackwardJumps(page) >= MIN_BACKWARD_JUMPS
        ? [
            {
              ...place,
              message:
                'The file draws its text out of reading order, so a parser that follows the file gets the lines scrambled.'
            }
          ]
        : [])
    ]
  })
  return warnings.length > 0
    ? warnings
    : [
        {
          rule: 'text-extraction',
          status: 'pass',
          message: 'No lost characters, glued words or scrambled order found.'
        }
      ]
}

const MIN_OVERLAP_RATIO = 0.5

// A picture that fills the page is the page itself, as in a scan, and text-layer reports that.
const isOverPicture = (item: PdfTextItem, page: PdfPageFacts): boolean =>
  (page.images ?? [])
    .filter((image) => !(image.width * image.height >= page.width * page.height * FULL_PAGE_RATIO))
    .some((image) => {
      const width = Math.min(item.x + item.width, image.x + image.width) - Math.max(item.x, image.x)
      const height =
        Math.min(item.y, image.y + image.height) - Math.max(item.y - item.height, image.y)
      return (
        width > 0 && height > 0 && width * height >= item.width * item.height * MIN_OVERLAP_RATIO
      )
    })

/**
 * Looks for text in the header or footer strip of a page and for icons standing as words, from the
 * positions in the PDF alone, and for text drawn over a picture.
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
    const overPicture = items.filter((item) => isOverPicture(item, page))
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
      ...(overPicture.length > 0
        ? [
            {
              rule: 'layout-traps',
              status: 'warn' as const,
              page: index + 1,
              message: `${overPicture.length} text strings sit over a picture, which a reader may take for part of the image.`
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
