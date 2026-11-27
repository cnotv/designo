export type AtsStatus = 'pass' | 'warn' | 'fail'

/** One result of one rule; `nodeId` and `page` say what it concerns, when it is one thing. */
export interface AtsFinding {
  rule: string
  status: AtsStatus
  message: string
  nodeId?: string
  /** The 1-based page of the PDF. */
  page?: number
}

/** A string of text as a PDF reader returns it, positioned from the top left of its page. */
export interface PdfTextItem {
  text: string
  x: number
  y: number
  width: number
  height: number
}

/** A rectangle on a page, measured from its top left. */
export interface PdfBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PdfPageFacts {
  width: number
  height: number
  /** In the order the file draws them, which is the order a reader that ignores position uses. */
  items: readonly PdfTextItem[]
  /** Where pictures are drawn; absent when the page's drawing was not read. */
  images?: readonly PdfBox[]
  /** Text drawn invisible, as a scanned page carries its OCR text. */
  hasInvisibleText?: boolean
}

export interface PdfFontFacts {
  name: string
  embedded: boolean
  hasUnicodeMap: boolean
}

export interface PdfLinkFacts {
  page: number
  url: string
  /** The text drawn inside the link's rectangle. */
  visibleText: string
}

/** Everything the checks know about an exported PDF. */
export interface PdfFacts {
  pages: readonly PdfPageFacts[]
  fonts: readonly PdfFontFacts[]
  title?: string
  author?: string
  language?: string
  links: readonly PdfLinkFacts[]
}

export interface AtsSummary {
  pass: number
  warn: number
  fail: number
}

/** A rule the report could not run, and why, so that its absence is not read as a pass. */
export interface AtsNotChecked {
  rule: string
  reason: string
}

export interface AtsReport {
  /** Which reader and rule set produced this; it is not a real ATS. */
  parser: string
  summary: AtsSummary
  findings: readonly AtsFinding[]
  /** Rules that were not run; empty when the document was there to check against. */
  notChecked: readonly AtsNotChecked[]
  /** The text a linear reader gets, a line each, page by page. */
  readingOrder: readonly (readonly string[])[]
}
