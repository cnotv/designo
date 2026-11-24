import { readImageSize, writeAsset } from '@designo/storage'
import { applyOperationsTool } from './tools.ts'
import type { DesignoToolContext } from './types.ts'

const DEFAULT_SIZE = 200

/**
 * Stores a picture and places it as an image node.
 * @param context - Where files live and how ids are made.
 * @param input - The file, the parent, the picture as base64, and optionally a name, position and
 * size; a size given on one side only keeps the picture's proportions.
 * @returns The asset id, the new node and its size, and any warning about where it landed.
 */
export const addImageTool = async (
  context: DesignoToolContext,
  input: {
    fileId: string
    parentId: string
    data: string
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
  const bytes = new Uint8Array(Buffer.from(input.data, 'base64'))
  const assetId = await writeAsset(context.dataDirectory, bytes)
  const natural = readImageSize(bytes) ?? { width: DEFAULT_SIZE, height: DEFAULT_SIZE }
  const width =
    input.width ?? (input.height ? (natural.width * input.height) / natural.height : natural.width)
  const height =
    input.height ?? (input.width ? (natural.height * input.width) / natural.width : natural.height)
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
