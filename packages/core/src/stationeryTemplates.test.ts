import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument, getChildren, getPageNodes } from './document.ts'
import { millimetresToPoints } from './pageSetup.ts'
import { PAPER_SIZES } from './paperSizes.ts'
import { STATIONERY_TEMPLATES } from './stationeryTemplates.ts'
import { getTemplateOperations } from './templateOperations.ts'

const idFactory = () => {
  let count = 0
  return (prefix: string): string => `new-${prefix}-${++count}`
}

describe('STATIONERY_TEMPLATES', () => {
  it('has a unique id for every template', () => {
    const ids = STATIONERY_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(STATIONERY_TEMPLATES)('$name names a paper size the list has', (template) => {
    expect(PAPER_SIZES.some((size) => size.id === template.paperSizeId)).toBe(true)
  })

  it.each(STATIONERY_TEMPLATES)('$name keeps every layer inside its page', (template) => {
    const size = PAPER_SIZES.find((candidate) => candidate.id === template.paperSizeId)
    const inside = template.nodes.every(
      (node) =>
        size !== undefined &&
        node.x >= 0 &&
        node.y >= 0 &&
        node.x + node.width <= size.width &&
        node.y + node.height <= size.height
    )
    expect(inside).toBe(true)
  })
})

describe('getTemplateOperations', () => {
  const template = STATIONERY_TEMPLATES.find((entry) => entry.id === 'letterhead')
  if (!template) throw new Error('The letterhead template is missing')
  const empty = createDocument('doc-1', 'Doc', 'page-1')

  it.each(STATIONERY_TEMPLATES)('$name applies to a document without error', (entry) => {
    const operations = getTemplateOperations(entry, idFactory())
    expect(applyOperations(empty, operations).ok).toBe(true)
  })

  it('adds one page holding a frame of the paper size, in millimetres', () => {
    const result = applyOperations(empty, getTemplateOperations(template, idFactory()))
    if (!result.ok) throw new Error(result.error)
    const pages = getPageNodes(result.document)
    expect(pages).toHaveLength(2)
    const [frame] = getChildren(result.document, pages[1]?.id ?? '')
    const size = PAPER_SIZES.find((candidate) => candidate.id === template.paperSizeId)
    expect(frame).toMatchObject({
      type: 'frame',
      pageUnit: 'mm',
      width: millimetresToPoints(size?.width ?? 0),
      height: millimetresToPoints(size?.height ?? 0)
    })
  })

  it('puts every layer of the template in the frame, in points', () => {
    const result = applyOperations(empty, getTemplateOperations(template, idFactory()))
    if (!result.ok) throw new Error(result.error)
    const [frame] = getChildren(result.document, getPageNodes(result.document)[1]?.id ?? '')
    const layers = getChildren(result.document, frame?.id ?? '')
    expect(layers).toHaveLength(template.nodes.length)
    expect(layers[0]?.x).toBeCloseTo(millimetresToPoints(template.nodes[0]?.x ?? 0), 5)
  })
})
