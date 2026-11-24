/** Where the Designo server serves stored pictures. */
const IMAGE_ROUTE = '/api/files/assets/'

/**
 * Says where a stored picture is served from.
 * @param assetId - The id of the picture.
 * @returns The URL.
 */
export const imageAssetUrl = (assetId: string): string => `${IMAGE_ROUTE}${assetId}`

// One decoded picture for each asset, kept for the session: the id is the hash of the bytes, so
// it never goes stale. `undefined` marks a load that has started or failed, so none is repeated.
const pictures = new Map<string, ImageBitmap | undefined>()
const listeners = new Set<() => void>()

const loadPicture = async (assetId: string): Promise<void> => {
  const response = await fetch(imageAssetUrl(assetId)).catch(() => undefined)
  const bitmap = response?.ok
    ? await createImageBitmap(await response.blob()).catch(() => undefined)
    : undefined
  pictures.set(assetId, bitmap)
  if (bitmap) listeners.forEach((listener) => listener())
}

/**
 * Gets a picture to draw, starting its load the first time it is asked for.
 * @param assetId - The id of the picture.
 * @returns The decoded picture, or undefined while it loads or when it cannot be loaded; the
 * node draws its fill until then.
 */
export const getLoadedImage = (assetId: string): ImageBitmap | undefined => {
  if (!pictures.has(assetId)) {
    pictures.set(assetId, undefined)
    void loadPicture(assetId)
  }
  return pictures.get(assetId)
}

/**
 * Hears when a picture has finished loading, so the canvas can draw it.
 * @param listener - Called after each load.
 * @returns A function that stops listening.
 */
export const onImageLoaded = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
