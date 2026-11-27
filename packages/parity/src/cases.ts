import {
  applyOperations,
  BLEND_MODES,
  createDocument,
  type BlendMode,
  type DesignNodePatch,
  type DesignOperation
} from '@designo/core'
import type { ParityCase } from './types.ts'

const FRAME_ID = 'frame'
const FRAME_WIDTH = 240
const FRAME_HEIGHT = 160

const WASH_STOPS = [
  { offset: 0, color: '#ff5a36' },
  { offset: 0.5, color: '#ffd23f' },
  { offset: 1, color: '#3b82f6' }
]

const frameOperation: DesignOperation = {
  kind: 'create',
  id: FRAME_ID,
  type: 'frame',
  parentId: 'page',
  properties: {
    name: 'Parity frame',
    x: 0,
    y: 0,
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    fill: '#ffffff',
    pdfPage: 1
  }
}

const shape = (
  id: string,
  type: 'rectangle' | 'ellipse',
  properties: DesignNodePatch
): DesignOperation => ({ kind: 'create', id, type, parentId: FRAME_ID, properties })

const buildCase = (
  name: string,
  description: string,
  operations: readonly DesignOperation[]
): ParityCase => {
  const result = applyOperations(createDocument(`parity-${name}`, `Parity: ${name}`, 'page'), [
    frameOperation,
    ...operations
  ])
  if (!result.ok) throw new Error(`The ${name} case does not build: ${result.error}`)
  return { name, description, document: result.document, frameId: FRAME_ID }
}

// A gradient behind the blended shape, so every mode has a range of colours to work on.
const blendCase = (mode: Exclude<BlendMode, 'normal'>): ParityCase =>
  buildCase(`blend-${mode}`, `A red ellipse in ${mode} mode over a gradient`, [
    shape('backdrop', 'rectangle', {
      x: 20,
      y: 20,
      width: 200,
      height: 120,
      gradient: { kind: 'linear', angle: 0, stops: WASH_STOPS }
    }),
    shape('blended', 'ellipse', {
      x: 70,
      y: 30,
      width: 100,
      height: 100,
      fill: '#c81e5a',
      blendMode: mode
    })
  ])

/**
 * One case for every effect a renderer draws: plain shapes as a baseline, both gradient kinds,
 * blur, a shadow, opacity and each blend mode.
 * @returns The cases, each a small document with one frame.
 */
export const createParityCases = (): ParityCase[] => [
  buildCase('shapes', 'A rounded rectangle with a stroke and an ellipse, no effect', [
    shape('rounded', 'rectangle', {
      x: 24,
      y: 30,
      width: 100,
      height: 100,
      fill: '#2d6a4f',
      cornerRadius: 16,
      stroke: '#111111',
      strokeWidth: 4
    }),
    shape('round', 'ellipse', { x: 140, y: 40, width: 80, height: 80, fill: '#f4a261' })
  ]),
  buildCase('gradient-linear', 'A linear gradient at 30 degrees', [
    shape('linear', 'rectangle', {
      x: 20,
      y: 20,
      width: 200,
      height: 120,
      cornerRadius: 12,
      gradient: { kind: 'linear', angle: 30, stops: WASH_STOPS }
    })
  ]),
  buildCase('gradient-radial', 'A radial gradient in an ellipse', [
    shape('radial', 'ellipse', {
      x: 20,
      y: 20,
      width: 200,
      height: 120,
      gradient: { kind: 'radial', angle: 0, stops: WASH_STOPS }
    })
  ]),
  buildCase('blur', 'An ellipse with a gaussian blur of 8', [
    shape('blurred', 'ellipse', {
      x: 50,
      y: 30,
      width: 140,
      height: 100,
      fill: '#2563eb',
      blur: 8
    })
  ]),
  buildCase('shadow', 'A white rectangle casting a soft, offset shadow', [
    shape('lifted', 'rectangle', {
      x: 60,
      y: 30,
      width: 110,
      height: 90,
      fill: '#ffffff',
      cornerRadius: 10,
      stroke: '#d0d0d0',
      shadow: { x: 8, y: 10, blur: 8, color: '#000000a0' }
    })
  ]),
  buildCase('opacity', 'Two overlapping shapes at half opacity', [
    shape('first', 'rectangle', {
      x: 30,
      y: 30,
      width: 110,
      height: 100,
      fill: '#1b4332',
      opacity: 0.5
    }),
    shape('second', 'ellipse', {
      x: 100,
      y: 30,
      width: 110,
      height: 100,
      fill: '#ef4444',
      opacity: 0.5
    })
  ]),
  ...BLEND_MODES.filter((mode): mode is Exclude<BlendMode, 'normal'> => mode !== 'normal').map(
    blendCase
  )
]
