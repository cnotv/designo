import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assetIdSchema } from './schemas.ts'

/** The largest picture the asset store keeps, in bytes. */
export const MAX_ASSET_BYTES = 20_971_520
const MAX_ASSET_MEGABYTES = 20

const ASSET_DIRECTORY = 'assets'

/** A picture type the store accepts, found from the file's own bytes. */
export interface ImageType {
  extension: 'png' | 'jpg' | 'webp' | 'gif'
  mimeType: string
}

// Signatures are compared as hex text, which keeps byte values out of the code.
const HEX_RADIX = 16
const toHex = (bytes: Uint8Array, from: number, length: number): string =>
  Array.from(bytes.subarray(from, from + length), (byte) =>
    byte.toString(HEX_RADIX).padStart(2, '0')
  ).join('')

const PNG_SIGNATURE = '89504e470d0a1a0a'
const JPEG_SIGNATURE = 'ffd8ff'
const GIF_SIGNATURE = '47494638'
const RIFF_SIGNATURE = '52494646'
const WEBP_SIGNATURE = '57454250'
const WEBP_OFFSET = 8

const startsWith = (bytes: Uint8Array, signature: string, offset = 0): boolean =>
  toHex(bytes, offset, signature.length / 2) === signature

/**
 * Tells what picture a file holds from its first bytes, never from a name or a claimed type, so a
 * script or an SVG with scripts cannot be stored as a picture.
 * @param bytes - The file's contents.
 * @returns The type, or undefined for anything that is not a PNG, JPEG, WebP or GIF.
 */
export const detectImageType = (bytes: Uint8Array): ImageType | undefined => {
  if (startsWith(bytes, PNG_SIGNATURE)) return { extension: 'png', mimeType: 'image/png' }
  if (startsWith(bytes, JPEG_SIGNATURE)) return { extension: 'jpg', mimeType: 'image/jpeg' }
  if (startsWith(bytes, GIF_SIGNATURE)) return { extension: 'gif', mimeType: 'image/gif' }
  if (startsWith(bytes, RIFF_SIGNATURE) && startsWith(bytes, WEBP_SIGNATURE, WEBP_OFFSET)) {
    return { extension: 'webp', mimeType: 'image/webp' }
  }
  return undefined
}

// The id becomes a file name, so it is validated before it can reach the file system.
const assetPath = (dataDirectory: string, assetId: string): string =>
  path.join(dataDirectory, ASSET_DIRECTORY, assetIdSchema.parse(assetId))

/**
 * Keeps a picture in the data directory under the SHA-256 of its bytes, so the same picture is
 * stored once however many times it is added.
 * @param dataDirectory - Where Designo files live.
 * @param bytes - The picture's file contents.
 * @returns The asset id, to set as a node's `imageAsset`.
 */
export const writeAsset = async (dataDirectory: string, bytes: Uint8Array): Promise<string> => {
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`The picture is larger than ${MAX_ASSET_MEGABYTES} MB`)
  }
  const type = detectImageType(bytes)
  if (!type) throw new Error('The file is not a PNG, JPEG, WebP or GIF picture')
  const assetId = `${createHash('sha256').update(bytes).digest('hex')}.${type.extension}`
  const targetPath = assetPath(dataDirectory, assetId)
  await mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, bytes)
  await rename(temporaryPath, targetPath)
  return assetId
}

/**
 * Reads a stored picture.
 * @param dataDirectory - Where Designo files live.
 * @param assetId - The id `writeAsset` returned.
 * @returns The bytes and the type to serve them as.
 */
export const readAsset = async (
  dataDirectory: string,
  assetId: string
): Promise<{ bytes: Uint8Array; mimeType: string }> => {
  const bytes = new Uint8Array(await readFile(assetPath(dataDirectory, assetId)))
  const mimeType = detectImageType(bytes)?.mimeType
  if (!mimeType) throw new Error('The stored file is not a picture')
  return { bytes, mimeType }
}
