import { exportNodeToSvg } from '@designo/exporter'
import { ref } from 'vue'
import { buildExportFileName, getExportTargetIds, getRasterSize } from '../editing/export.ts'
import type { ExportSettings } from '../editing/types.ts'
import type { Editor, ExportController } from './types.ts'

const DEFAULT_SETTINGS: ExportSettings = { format: 'svg', scale: 2 }

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
  // The click starts the download synchronously; revoking right away is safe in current browsers
  // but a tick of grace keeps older ones from losing the file.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image: HTMLImageElement = Object.assign(new Image(), {
      onload: () => resolve(image),
      onerror: () => reject(new Error('The browser could not draw the SVG')),
      src: url
    })
  })

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode the PNG'))),
      'image/png'
    )
  })

// The browser draws the SVG itself, so PNG needs no rasteriser in the bundle; the MCP server uses
// resvg for the same job in Node.
const rasterizeSvg = async (svg: string, scale: number): Promise<Blob> => {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = await loadImage(svgUrl)
    const size = getRasterSize({ width: image.naturalWidth, height: image.naturalHeight }, scale)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The browser has no 2D canvas')
    context.drawImage(image, 0, 0, size.width, size.height)
    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

const renderExport = (svg: string, settings: ExportSettings): Promise<Blob> =>
  settings.format === 'svg'
    ? Promise.resolve(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    : rasterizeSvg(svg, settings.scale)

/**
 * Exports the selected layers, or the page when none is selected, as downloads.
 * @param editor - The editor state.
 * @returns The export settings, progress and the action that runs the export.
 */
export const useExport = (editor: Editor): ExportController => {
  const settings = ref<ExportSettings>({ ...DEFAULT_SETTINGS })
  const isExporting = ref(false)
  const error = ref<string | undefined>()

  const exportNode = async (
    exportedDocument: NonNullable<Editor['document']['value']>,
    nodeId: string
  ): Promise<void> => {
    const node = exportedDocument.nodes[nodeId]
    if (!node) return
    const svg = exportNodeToSvg(exportedDocument, nodeId)
    const blob = await renderExport(svg, settings.value)
    downloadBlob(blob, buildExportFileName(node.name, settings.value.format, settings.value.scale))
  }

  const run = async (): Promise<void> => {
    const currentDocument = editor.document.value
    if (!currentDocument || isExporting.value) return
    isExporting.value = true
    error.value = undefined
    try {
      // One after another, because browsers drop downloads started in the same instant.
      await getExportTargetIds(currentDocument, editor.selection.value).reduce(
        (previous, nodeId) => previous.then(() => exportNode(currentDocument, nodeId)),
        Promise.resolve()
      )
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'The export failed'
    } finally {
      isExporting.value = false
    }
  }

  return { settings, isExporting, error, run }
}
