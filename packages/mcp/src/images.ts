import { getSubtreeIds, type DesignDocument, type DesignNode } from '@designo/core'
import { readAsset } from '@designo/storage'

/** The pictures a render needs, read from the asset store. */
export type LoadedImages = ReadonlyMap<string, { bytes: Uint8Array; mimeType: string }>

const readNodePictures = async (
  dataDirectory: string,
  nodes: readonly (DesignNode | undefined)[]
): Promise<LoadedImages> => {
  const assetIds = new Set(nodes.flatMap((node) => (node?.imageAsset ? [node.imageAsset] : [])))
  const loaded = await Promise.all(
    [...assetIds].map(async (assetId) => {
      const asset = await readAsset(dataDirectory, assetId).catch(() => undefined)
      return asset ? ([assetId, asset] as const) : undefined
    })
  )
  return new Map(loaded.filter((entry) => entry !== undefined))
}

/**
 * Reads the pictures the nodes under a node use. One that is missing is left out, so its node
 * draws as its fill instead of failing the render.
 * @param dataDirectory - Where Designo files live.
 * @param document - The document.
 * @param nodeId - The node whose subtree is rendered.
 * @returns The pictures by asset id.
 */
export const loadSubtreeImages = (
  dataDirectory: string,
  document: DesignDocument,
  nodeId: string
): Promise<LoadedImages> =>
  readNodePictures(
    dataDirectory,
    getSubtreeIds(document, nodeId).map((id) => document.nodes[id])
  )

/**
 * Reads the pictures any page of a document uses, which a PDF of every page needs.
 * @param dataDirectory - Where Designo files live.
 * @param document - The document.
 * @returns The pictures by asset id.
 */
export const loadDocumentImages = (
  dataDirectory: string,
  document: DesignDocument
): Promise<LoadedImages> => readNodePictures(dataDirectory, Object.values(document.nodes))

/**
 * Says how the exporters reach loaded pictures: a data URI for SVG, bytes for PDF.
 * @param images - The pictures a render needs.
 * @returns The two lookups the exporters take.
 */
export const toImageLookups = (
  images: LoadedImages
): {
  getImageHref: (assetId: string) => string | undefined
  getImageBytes: (assetId: string) => Uint8Array | undefined
} => ({
  getImageHref: (assetId) => {
    const image = images.get(assetId)
    return image
      ? `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString('base64')}`
      : undefined
  },
  getImageBytes: (assetId) => images.get(assetId)?.bytes
})
