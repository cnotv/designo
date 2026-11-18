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

const WASH_STOPS = [
  { offset: 0, color: '#ff5a36' },
  { offset: 0.5, color: '#ffd23f' },
  { offset: 1, color: '#3b82f6' }
]

// A row under the swatches that shows each effect: gradients, blur, a shadow and multiply.
const effectOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'effect-linear',
    type: 'rectangle',
    parentId: 'frame',
    properties: {
      x: 32,
      y: 270,
      width: 120,
      height: 80,
      cornerRadius: 12,
      gradient: { kind: 'linear', angle: 30, stops: WASH_STOPS }
    }
  },
  {
    kind: 'create',
    id: 'effect-radial',
    type: 'ellipse',
    parentId: 'frame',
    properties: {
      x: 168,
      y: 270,
      width: 120,
      height: 80,
      gradient: { kind: 'radial', angle: 0, stops: WASH_STOPS }
    }
  },
  {
    kind: 'create',
    id: 'effect-blur',
    type: 'ellipse',
    parentId: 'frame',
    properties: { x: 304, y: 270, width: 110, height: 80, fill: '#2563eb', blur: 8 }
  },
  {
    kind: 'create',
    id: 'effect-shadow',
    type: 'rectangle',
    parentId: 'frame',
    properties: {
      x: 436,
      y: 272,
      width: 80,
      height: 70,
      fill: '#ffffff',
      cornerRadius: 10,
      shadow: { x: 6, y: 8, blur: 6, color: '#000000a0' }
    }
  },
  {
    kind: 'create',
    id: 'effect-multiply-red',
    type: 'ellipse',
    parentId: 'frame',
    properties: { x: 530, y: 268, width: 70, height: 70, fill: '#ef4444', blendMode: 'multiply' }
  },
  {
    kind: 'create',
    id: 'effect-multiply-blue',
    type: 'ellipse',
    parentId: 'frame',
    properties: { x: 566, y: 296, width: 60, height: 60, fill: '#3b82f6', blendMode: 'multiply' }
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
      properties: { width: 640, height: 380, fill: '#ffffff', stroke: '#e3e3e3', cornerRadius: 20 }
    },
    {
      kind: 'create',
      id: 'title',
      type: 'text',
      parentId: 'frame',
      properties: { x: SWATCH_LEFT, y: 28, text: 'Forest palette', fontSize: 24, fill: '#111111' }
    },
    ...SWATCH_COLORS.flatMap(swatchOperations),
    ...effectOperations()
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}
