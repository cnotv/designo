import { readFile } from 'node:fs/promises'
import {
  MAX_ASSET_BYTES,
  detectImageType,
  readAsset,
  readImageSize,
  writeAsset
} from '@designo/storage'
import { applyOperationsTool } from './tools.ts'
import type { DesignoToolContext } from './types.ts'

const FETCH_TIMEOUT_MS = 15_000
const UNDECODABLE = 'The picture does not decode: its header is damaged or cut short'

type PictureSource = { data?: string; path?: string; url?: string; assetId?: string }

// ponytail: no private-address block on url, only picture bytes ever reach the document; add an allowlist if the server is exposed.
const downloadPicture = async (url: string): Promise<Uint8Array> => {
  if (!/^https?:\/\//i.test(url)) throw new Error('The url must start with http or https')
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`The url answered ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_ASSET_BYTES) throw new Error('The picture is larger than 20 MB')
  return new Uint8Array(await response.arrayBuffer())
}

const resolveAssetId = async (
  context: DesignoToolContext,
  source: PictureSource
): Promise<string> => {
  if (source.assetId) {
    await readAsset(context.dataDirectory, source.assetId).catch(() => {
      throw new Error(`No stored picture has the id ${source.assetId}`)
    })
    return source.assetId
  }
  const bytes = source.path
    ? new Uint8Array(await readFile(source.path))
    : source.url
      ? await downloadPicture(source.url)
      : new Uint8Array(Buffer.from(source.data ?? '', 'base64'))
  // A header that gives no size is cut short or damaged: refuse it rather than store a blank.
  if (detectImageType(bytes) && !readImageSize(bytes)) throw new Error(UNDECODABLE)
  return writeAsset(context.dataDirectory, bytes)
}

const fitBox = (
  natural: { width: number; height: number },
  given: { width?: number; height?: number }
): { width: number; height: number } => ({
  width:
    given.width ?? (given.height ? (natural.width * given.height) / natural.height : natural.width),
  height:
    given.height ?? (given.width ? (natural.height * given.width) / natural.width : natural.height)
})

/**
 * Stores a picture and places it as an image node.
 * @param context - Where files live and how ids are made.
 * @param input - The file, the parent, the picture from exactly one of base64 `data`, a `path`
 * the server can read, a `url`, or the `assetId` of one already stored, and optionally a name,
 * position and size; a size given on one side only keeps the picture's proportions.
 * @returns The asset id, the new node and its size, and any warning about where it landed.
 */
export const addImageTool = async (
  context: DesignoToolContext,
  input: {
    fileId: string
    parentId: string
    data?: string
    path?: string
    url?: string
    assetId?: string
    name?: string
    x?: number
    y?: number
    width?: number
    height?: number
  }
): Promise<{
  assetId: string
  nodeId: string
  width: number
  height: number
  warnings: string[]
}> => {
  const given = [input.data, input.path, input.url, input.assetId].filter((value) => value)
  if (given.length !== 1) throw new Error('Give exactly one of data, path, url and assetId')
  const assetId = await resolveAssetId(context, input)
  const { bytes } = await readAsset(context.dataDirectory, assetId)
  const natural = readImageSize(bytes)
  if (!natural) throw new Error(UNDECODABLE)
  const { width, height } = fitBox(natural, input)
  const { createdNodeIds, warnings } = await applyOperationsTool(context, {
    fileId: input.fileId,
    operations: [
      {
        kind: 'create',
        type: 'image',
        parentId: input.parentId,
        properties: {
          imageAsset: assetId,
          name: input.name ?? 'Image',
          x: input.x ?? 0,
          y: input.y ?? 0,
          width,
          height
        }
      }
    ]
  })
  return { assetId, nodeId: createdNodeIds[0] ?? '', width, height, warnings }
}
