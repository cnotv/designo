import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignOperation
} from '@designo/core'

const SWATCH_COLORS = ['#1b4332', '#2d6a4f', '#52b788', '#d8f3dc', '#f4a261']
const SWATCH_STEP = 120
const SWATCH_LEFT = 32

const swatchOperations = (color: string, position: number): DesignOperation[] => [
  {
    kind: 'create',
    id: `swatch-${position}`,
    type: 'rectangle',
    parentId: 'frame',
    properties: {
      x: SWATCH_LEFT + position * SWATCH_STEP,
      y: 80,
      width: 96,
      height: 112,
      fill: color,
      cornerRadius: 12
    }
  },
  {
    kind: 'create',
    id: `label-${position}`,
    type: 'text',
    parentId: 'frame',
    properties: {
      x: SWATCH_LEFT + position * SWATCH_STEP,
      y: 204,
      text: color,
      fontSize: 14,
      fill: '#555555'
    }
  }
]

/**
 * Builds the sample file the editor shows when no Designo server is behind it, as on the public demo.
 * @returns The sample document.
 */
export const createPaletteDocument = (): DesignDocument => {
  const result = applyOperations(createDocument('sample-palette', 'Sample: palette', 'page'), [
    {
      kind: 'create',
      id: 'frame',
      type: 'frame',
      parentId: 'page',
      properties: { width: 640, height: 260, fill: '#ffffff', stroke: '#e3e3e3', cornerRadius: 20 }
    },
    {
      kind: 'create',
      id: 'title',
      type: 'text',
      parentId: 'frame',
      properties: { x: SWATCH_LEFT, y: 28, text: 'Forest palette', fontSize: 24, fill: '#111111' }
    },
    ...SWATCH_COLORS.flatMap(swatchOperations)
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}
