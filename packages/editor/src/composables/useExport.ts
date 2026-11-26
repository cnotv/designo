import { resolveMasters } from '@designo/core'
import { exportNodeToSvg } from '@designo/exporter'
import { loadTextLayout, toTextLayoutRequest } from '@designo/text'
import { ref } from 'vue'
import { buildExportFileName, getExportTargetIds, getRasterSize } from '../editing/export.ts'
import type { ExportSettings } from '../editing/types.ts'
import { getSharedTextRuntime } from '../rendering/text/sharedTextEngine.ts'
import type { Editor, ExportController } from './types.ts'

const DEFAULT_SETTINGS: ExportSettings = { format: 'svg', scale: 2, trimMarks: false }

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

// A blurred node is an image in the PDF, drawn at the density a print needs.
const PDF_RASTER_SCALE = 3

const exportPdf = async (
  exportedDocument: NonNullable<Editor['document']['value']>,
  trimMarks: boolean
): Promise<Blob> => {
  const runtime = getSharedTextRuntime()
  const layouts = new Map(
    await Promise.all(
      Object.values(exportedDocument.nodes)
        .filter((node) => node.type === 'text' && node.visible && node.text !== '')
        .map(
          async (node) =>
            [node.id, await loadTextLayout(runtime, toTextLayoutRequest(node))] as const
        )
    )
  )
  // Loaded on demand: the PDF writer is most of what a PDF costs and nothing else needs it.
  const { exportDocumentToPdf } = await import('@designo/exporter/pdf')
  const bytes = await exportDocumentToPdf(exportedDocument, {
    trimMarks,
    getTextLayout: (node) => layouts.get(node.id),
    getFontBytes: runtime.library.getFontBytes,
    rasterizeNode: async (nodeId) => {
      const png = await rasterizeSvg(exportNodeToSvg(exportedDocument, nodeId), PDF_RASTER_SCALE)
      return new Uint8Array(await png.arrayBuffer())
    }
  })
  return new Blob([bytes], { type: 'application/pdf' })
}

/**
 * Exports the selected layers, or the page when none is selected, as downloads; a PDF is always
 * the whole document, a page for each of its pages.
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
    const storedDocument = editor.document.value
    if (!storedDocument || isExporting.value) return
    const currentDocument = resolveMasters(storedDocument)
    isExporting.value = true
    error.value = undefined
    try {
      if (settings.value.format === 'pdf') {
        downloadBlob(
          await exportPdf(currentDocument, settings.value.trimMarks),
          buildExportFileName(currentDocument.name, 'pdf', settings.value.scale)
        )
        return
      }
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
