import type { DesignDocument } from '@designo/core'
import type { PlacedNode } from './scope.ts'
import type { AtsFinding, PdfFacts } from './types.ts'

/**
 * Checks that each font is embedded and has a map from its glyphs back to Unicode, without which a
 * reader gets codes instead of letters.
 * @param facts - What a reader finds in the PDF.
 * @returns A failure for each font that lacks either, or one pass.
 */
export const checkFonts = (facts: PdfFacts): AtsFinding[] => {
  const failures = facts.fonts
    .filter((font) => !font.embedded || !font.hasUnicodeMap)
    .map((font): AtsFinding => ({
      rule: 'fonts',
      status: 'fail',
      message: `${font.name}: ${[
        ...(font.embedded ? [] : ['not embedded']),
        ...(font.hasUnicodeMap ? [] : ['no Unicode map'])
      ].join(', ')}.`
    }))
  return failures.length > 0
    ? failures
    : [
        {
          rule: 'fonts',
          status: 'pass',
          message: `${facts.fonts.length} fonts, all embedded with a Unicode map.`
        }
      ]
}

/**
 * Checks the title, the author and the language the PDF carries. A title that is only the file
 * name is not one.
 * @param document - The exported document.
 * @param facts - What a reader finds in the PDF.
 * @returns A warning for each missing field, or one pass.
 */
export const checkMetadata = (document: DesignDocument, facts: PdfFacts): AtsFinding[] => {
  const missing = [
    ...(document.metadata?.title ? [] : ['title (the file name stands in for it)']),
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
 * Checks that each link of the document is a link annotation in the PDF, and that its text is
 * drawn where the link is, so a reader that lists link text finds it.
 * @param placedNodes - What the export draws.
 * @param facts - What a reader finds in the PDF.
 * @returns A finding for each missing link or hidden link text, or one pass.
 */
export const checkLinks = (placedNodes: readonly PlacedNode[], facts: PdfFacts): AtsFinding[] => {
  const linked = placedNodes.filter((placed) => placed.node.link)
  const problems = [
    ...linked
      .filter((placed) => !facts.links.some((link) => link.url === placed.node.link))
      .map<AtsFinding>((placed) => ({
        rule: 'links',
        status: 'fail',
        message: `The link to ${placed.node.link} is not an annotation in the PDF.`,
        nodeId: placed.node.id,
        page: placed.page
      })),
    ...facts.links
      .filter((link) => link.visibleText.trim() === '')
      .map<AtsFinding>((link) => ({
        rule: 'links',
        status: 'warn',
        message: `The link to ${link.url} has no visible text, so a reader that lists link text shows nothing.`,
        page: link.page
      }))
  ]
  return problems.length > 0
    ? problems
    : [
        {
          rule: 'links',
          status: 'pass',
          message:
            linked.length === 0
              ? 'The document has no links.'
              : `${linked.length} links, each with visible text.`
        }
      ]
}
