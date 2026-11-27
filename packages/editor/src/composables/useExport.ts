import { resolveMasters } from '@designo/core'
import { exportNodeToCode, exportNodeToSvg, type CodeFile } from '@designo/exporter'
import { loadTextLayout, toTextLayoutRequest } from '@designo/text'
import { ref, watch } from 'vue'
import type { AtsReport, PdfFacts } from '@designo/ats'
import {
  buildExportFileName,
  getCodeMediaType,
  getExportTargetIds,
  getRasterSize,
  isCodeFormat
} from '../editing/export.ts'
import type { ExportSettings } from '../editing/types.ts'
import { getSharedTextRuntime } from '../rendering/text/sharedTextEngine.ts'
import type { EditorStore } from '../stores/types.ts'
import type { ExportController } from './types.ts'

const DEFAULT_SETTINGS: ExportSettings = {
  format: 'svg',
  scale: 2,
  trimMarks: false,
  colorSpace: 'rgb'
}

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click()
  // The click starts the download synchronously; revoking right away is safe in current browsers
  // but a tick of grace keeps older ones from losing the file.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// One after another, as with several layers: browsers drop downloads started in the same instant.
const downloadCodeFiles = (files: readonly CodeFile[]): Promise<void> =>
  files.reduce(
    (previous, file) =>
      previous.then(() =>
        downloadBlob(new Blob([file.content], { type: getCodeMediaType(file.path) }), file.path)
      ),
    Promise.resolve()
  )

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
  exportedDocument: NonNullable<EditorStore['document']>,
  { trimMarks, colorSpace }: Pick<ExportSettings, 'trimMarks' | 'colorSpace'>
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
    colorSpace,
    getTextLayout: (node) => layouts.get(node.id),
    getFontBytes: runtime.library.getFontBytes,
    rasterizeNode: async (nodeId) => {
      const png = await rasterizeSvg(exportNodeToSvg(exportedDocument, nodeId), PDF_RASTER_SCALE)
      return new Uint8Array(await png.arrayBuffer())
    }
  })
  return new Blob([bytes], { type: 'application/pdf' })
}

type AtsModule = typeof import('@designo/ats') & {
  extractPdfFacts: (bytes: Uint8Array) => Promise<PdfFacts>
}

/**
 * Exports the selected layers, or the page when none is selected, as downloads; a PDF is always
 * the whole document, a page for each of its pages.
 * @param editor - The editor state.
 * @returns The export settings, progress and the action that runs the export.
 */
export const useExport = (editor: EditorStore): ExportController => {
  const settings = ref<ExportSettings>({ ...DEFAULT_SETTINGS })
  const isExporting = ref(false)
  const error = ref<string | undefined>()
  const atsReport = ref<AtsReport | undefined>()
  const isCheckingAts = ref(false)

  // A report on the open document is retired by an edit; one on a file from disk has no document
  // to go stale against.
  const isReportOfFile = ref(false)
  watch(
    () => editor.document,
    () => {
      if (!isReportOfFile.value) atsReport.value = undefined
    }
  )

  const runAtsCheck = async (
    check: (ats: AtsModule) => Promise<AtsReport>,
    fromFile: boolean
  ): Promise<void> => {
    if (isCheckingAts.value) return
    isCheckingAts.value = true
    error.value = undefined
    try {
      // Loaded on demand with the worker pdf.js reads in; nothing else in the editor needs them.
      const [reader, rules, { default: workerSource }] = await Promise.all([
        import('@designo/ats/extract'),
        import('@designo/ats'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
      ])
      atsReport.value = await check({
        extractPdfFacts: (bytes) => reader.extractPdfFacts(bytes, workerSource),
        ...rules
      })
      isReportOfFile.value = fromFile
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'The ATS check failed'
    } finally {
      isCheckingAts.value = false
    }
  }

  const checkAts = async (): Promise<void> => {
    const storedDocument = editor.document
    if (!storedDocument) return
    const currentDocument = resolveMasters(storedDocument)
    await runAtsCheck(async (ats) => {
      const pdf = await exportPdf(currentDocument, { trimMarks: false, colorSpace: 'rgb' })
      return ats.checkAts(
        currentDocument,
        await ats.extractPdfFacts(new Uint8Array(await pdf.arrayBuffer()))
      )
    }, false)
  }

  const checkPdfFile = (file: File): Promise<void> =>
    runAtsCheck(async (ats) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      try {
        return ats.checkPdfAts(await ats.extractPdfFacts(bytes))
      } catch {
        throw new Error('The file could not be read as a PDF; it may be damaged or protected.')
      }
    }, true)

  const exportNode = async (
    exportedDocument: NonNullable<EditorStore['document']>,
    nodeId: string
  ): Promise<void> => {
    const node = exportedDocument.nodes[nodeId]
    if (!node) return
    const { format } = settings.value
    if (isCodeFormat(format)) {
      await downloadCodeFiles(exportNodeToCode(exportedDocument, nodeId, format))
      return
    }
    const svg = exportNodeToSvg(exportedDocument, nodeId)
    const blob = await renderExport(svg, settings.value)
    downloadBlob(blob, buildExportFileName(node.name, settings.value.format, settings.value.scale))
  }

  const run = async (): Promise<void> => {
    const storedDocument = editor.document
    if (!storedDocument || isExporting.value) return
    const currentDocument = resolveMasters(storedDocument)
    isExporting.value = true
    error.value = undefined
    try {
      if (settings.value.format === 'pdf') {
        downloadBlob(
          await exportPdf(currentDocument, settings.value),
          buildExportFileName(currentDocument.name, 'pdf', settings.value.scale)
        )
        return
      }
      // One after another, because browsers drop downloads started in the same instant.
      await getExportTargetIds(currentDocument, editor.selection).reduce(
        (previous, nodeId) => previous.then(() => exportNode(currentDocument, nodeId)),
        Promise.resolve()
      )
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : 'The export failed'
    } finally {
      isExporting.value = false
    }
  }

  return { settings, isExporting, error, run, atsReport, isCheckingAts, checkAts, checkPdfFile }
}
