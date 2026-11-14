import type { GenerateId } from '@designo/storage'

export interface DesignoToolContext {
  dataDirectory: string
  generateId: GenerateId
}

export interface ScreenshotImage {
  mimeType: 'image/png'
  /** Base64-encoded PNG bytes. */
  data: string
}
