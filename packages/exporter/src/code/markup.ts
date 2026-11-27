import type { CodeElement, CodeTextRun, CodeVector } from '../types.ts'

/** How one flavour of markup writes names, text and empty elements. */
export interface MarkupDialect {
  classAttribute: 'class' | 'className'
  /** SVG attributes: `stroke-width` in HTML and Vue, `strokeWidth` in JSX. */
  strokeWidthAttribute: 'stroke-width' | 'strokeWidth'
  text: (value: string) => string
  attribute: (value: string) => string
  /** How an element with no content closes: `>` for HTML, ` />` for JSX and Vue. */
  voidClose: string
}

const INDENT = '  '

/**
 * Escapes text for HTML and Vue templates.
 * @param value - Raw text.
 * @returns The text with markup characters as entities.
 */
export const escapeHtmlText = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * Escapes an attribute value written between double quotes.
 * @param value - Raw value.
 * @returns The escaped value.
 */
export const escapeHtmlAttribute = (value: string): string =>
  escapeHtmlText(value).replaceAll('"', '&quot;')

export const HTML_DIALECT: MarkupDialect = {
  classAttribute: 'class',
  strokeWidthAttribute: 'stroke-width',
  text: escapeHtmlText,
  attribute: escapeHtmlAttribute,
  voidClose: '>'
}

export const VUE_DIALECT: MarkupDialect = { ...HTML_DIALECT, voidClose: ' />' }

// Plain JSX text drops line breaks, collapses edge spaces and reads braces and angle brackets as
// code, so a text with any of them is a JavaScript string in braces instead.
const JSX_UNSAFE_TEXT = /[\n<>{}]|^\s|\s$|\s{2}/

const jsxText = (value: string): string => {
  if (value === '') return ''
  return JSX_UNSAFE_TEXT.test(value) ? `{${JSON.stringify(value)}}` : value.replaceAll('&', '&amp;')
}

export const JSX_DIALECT: MarkupDialect = {
  classAttribute: 'className',
  strokeWidthAttribute: 'strokeWidth',
  text: jsxText,
  attribute: escapeHtmlAttribute,
  voidClose: ' />'
}

const indent = (depth: number): string => INDENT.repeat(depth)

const runMarkup = (dialect: MarkupDialect, run: CodeTextRun): string =>
  run.className
    ? `<span ${dialect.classAttribute}="${run.className}">${dialect.text(run.text)}</span>`
    : dialect.text(run.text)

const paragraphMarkup = (dialect: MarkupDialect, runs: readonly CodeTextRun[]): string =>
  runs.map((run) => runMarkup(dialect, run)).join('')

const textMarkup = (dialect: MarkupDialect, element: CodeElement, depth: number): string[] => {
  const paragraphs = element.paragraphs ?? []
  const open = `${indent(depth)}<${element.tag} ${dialect.classAttribute}="${element.className}">`
  if (element.tag === 'ul' || element.tag === 'ol')
    return [
      open,
      ...paragraphs.map((runs) => `${indent(depth + 1)}<li>${paragraphMarkup(dialect, runs)}</li>`),
      `${indent(depth)}</${element.tag}>`
    ]
  // The element keeps white space, so a line break in the text stays one.
  const lineBreak = dialect.text('\n')
  return [
    `${open}${paragraphs.map((runs) => paragraphMarkup(dialect, runs)).join(lineBreak)}</${element.tag}>`
  ]
}

const vectorMarkup = (
  dialect: MarkupDialect,
  element: CodeElement,
  vector: CodeVector,
  depth: number
): string[] => [
  `${indent(depth)}<svg ${dialect.classAttribute}="${element.className}" viewBox="0 0 ${vector.width} ${vector.height}" xmlns="http://www.w3.org/2000/svg">`,
  `${indent(depth + 1)}<path d="${dialect.attribute(vector.pathData)}" fill="${dialect.attribute(vector.fill)}"${
    vector.stroke
      ? ` stroke="${dialect.attribute(vector.stroke)}" ${dialect.strokeWidthAttribute}="${vector.strokeWidth}"`
      : ''
  }${dialect.voidClose}`,
  `${indent(depth)}</svg>`
]

const elementBody = (dialect: MarkupDialect, element: CodeElement, depth: number): string[] => {
  if (element.paragraphs) return textMarkup(dialect, element, depth)
  if (element.vector) return vectorMarkup(dialect, element, element.vector, depth)
  if (element.image)
    return [
      `${indent(depth)}<img ${dialect.classAttribute}="${element.className}" src="${dialect.attribute(element.image.source)}" alt="${dialect.attribute(element.image.alt)}"${dialect.voidClose}`
    ]
  const open = `${indent(depth)}<${element.tag} ${dialect.classAttribute}="${element.className}">`
  if (element.children.length === 0) return [`${open}</${element.tag}>`]
  return [
    open,
    ...element.children.flatMap((child) => elementMarkup(dialect, child, depth + 1)),
    `${indent(depth)}</${element.tag}>`
  ]
}

/**
 * Writes an element and everything under it as indented markup.
 * @param dialect - HTML, Vue or JSX.
 * @param element - The element.
 * @param depth - How far it is indented.
 * @returns The lines of markup.
 */
export const elementMarkup = (
  dialect: MarkupDialect,
  element: CodeElement,
  depth: number
): string[] => {
  const body = elementBody(dialect, element, element.link ? depth + 1 : depth)
  return element.link
    ? [
        `${indent(depth)}<a href="${dialect.attribute(element.link)}">`,
        ...body,
        `${indent(depth)}</a>`
      ]
    : body
}
