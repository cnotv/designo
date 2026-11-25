import { IMAGE_FITS, type DesignOperation, type ImageFit } from '@designo/core'
import type { Point } from './types.ts'

/** The longest side a picture takes when it is first placed, in world units. */
export const MAX_INSERTED_IMAGE_SIDE = 400

const HALF = 2
const MIN_SIDE = 1

/** A picture's size, in pixels or world units. */
export interface PictureSize {
  width: number
  height: number
}

/**
 * Sizes a picture for its first placement: its own size, or smaller so the longer side fits.
 * @param natural - The picture's size in pixels.
 * @param maxSide - The longest side allowed.
 * @returns The size, with the picture's proportions.
 */
export const fitImageSize = (natural: PictureSize, maxSide: number): PictureSize => {
  const ratio = Math.min(1, maxSide / Math.max(natural.width, natural.height))
  return {
    width: Math.max(MIN_SIDE, Math.round(natural.width * ratio)),
    height: Math.max(MIN_SIDE, Math.round(natural.height * ratio))
  }
}

/**
 * Builds the operation that places a stored picture as an image node.
 * @param placement - The new node's id and parent, the picture's asset id and size, and the
 * point it is centred on, in world units.
 * @returns The create operation.
 */
export const createImageInsertOperation = ({
  nodeId,
  parentId,
  assetId,
  size,
  center
}: {
  nodeId: string
  parentId: string
  assetId: string
  size: PictureSize
  center: Point
}): DesignOperation => ({
  kind: 'create',
  id: nodeId,
  type: 'image',
  parentId,
  properties: {
    name: 'Image',
    imageAsset: assetId,
    x: center.x - size.width / HALF,
    y: center.y - size.height / HALF,
    width: size.width,
    height: size.height
  }
})

/** The fit choices in the properties panel, in the order they are listed. */
export const IMAGE_FIT_OPTIONS: readonly { value: ImageFit; label: string }[] = [
  { value: 'stretch', label: 'Stretch' },
  { value: 'fit', label: 'Fit inside' },
  { value: 'fill', label: 'Fill and crop' }
]

/**
 * Reads a select's value as a fit, so nothing else reaches the node.
 * @param raw - The value the select reported.
 * @returns The fit, or undefined for anything that is not one.
 */
export const readImageFit = (raw: unknown): ImageFit | undefined =>
  IMAGE_FITS.find((fit) => fit === raw)

/**
 * Tells whether a dragged item or file is a picture the store accepts, by its claimed type; the
 * server checks the bytes.
 * @param type - The file's MIME type.
 * @returns True for PNG, JPEG, WebP and GIF.
 */
export const isPictureType = (type: string): boolean =>
  ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)
