/** Pixels as plain numbers, which Playwright can pass from the page to Node. */
export interface BrowserImage {
  width: number
  height: number
  pixels: number[]
}

/** What the parity page puts on `window.designoParity` for the runner to call. */
export interface ParityPage {
  renderWebgl: (caseName: string) => BrowserImage
  renderPdf: (pdfBytes: readonly number[]) => Promise<BrowserImage>
}

declare global {
  interface Window {
    designoParity: ParityPage
  }
}
