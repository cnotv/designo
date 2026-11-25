import {
  createImageInsertOperation,
  fitImageSize,
  MAX_INSERTED_IMAGE_SIDE
} from '../editing/images.ts'
import { findContainerAtPoint } from '../editing/selection.ts'
import { indexDocument } from '../editing/spatialIndex.ts'
import type { Point } from '../editing/types.ts'
import { screenToWorld } from '../editing/viewport.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import { uploadImage } from '../lib/uploadImage.ts'
import type { DesignoFiles, Editor } from './types.ts'

const HALF = 2

/**
 * Puts pictures the person chose onto the canvas.
 * @param editor - The editor.
 * @param files - The files, whose error line reports a picture that cannot be placed.
 * @returns `insertImageFile`, which adds a picture as a new image node at a point on the canvas
 * (a drop) or the middle of the view,
 * and `replaceImageFile`, which sets another picture on an image node.
 */
export const useImageInsertion = (editor: Editor, files: DesignoFiles) => {
  const report = (error: unknown): void => {
    files.saveError.value = error instanceof Error ? error.message : 'The picture was not added'
  }

  const insertImageFile = async (file: File, screenPoint?: Point): Promise<void> => {
    const document = editor.document.value
    if (!document) return
    try {
      const assetId = await uploadImage(file)
      const bitmap = await createImageBitmap(file)
      const size = fitImageSize(bitmap, MAX_INSERTED_IMAGE_SIDE)
      const center = screenToWorld(
        editor.viewport.value,
        screenPoint ?? {
          x: editor.canvasSize.value.width / HALF,
          y: editor.canvasSize.value.height / HALF
        }
      )
      const nodeId = createNodeId('image')
      const parentId = findContainerAtPoint(document, indexDocument(document), center)
      const added = editor.commit([
        createImageInsertOperation({ nodeId, parentId, assetId, size, center })
      ])
      if (added) editor.select([nodeId])
    } catch (error) {
      report(error)
    }
  }

  const replaceImageFile = async (nodeId: string, file: File): Promise<void> => {
    try {
      editor.updateNode(nodeId, { imageAsset: await uploadImage(file) })
    } catch (error) {
      report(error)
    }
  }

  return { insertImageFile, replaceImageFile }
}
