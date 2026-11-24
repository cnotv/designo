import { millimetresToPoints } from './pageSetup.ts'
import { PAPER_SIZES } from './paperSizes.ts'
import type { DesignOperation, StationeryTemplate } from './types.ts'

const PAGE_FILL = '#ffffff'

/**
 * Turns a template into the operations that add it as a new page: a frame at the template's paper
 * size, in millimetres, with the template's layers inside it.
 * @param template - The template to start from.
 * @param createId - Makes a fresh id for a node of the given kind, such as `page` or `frame`.
 * @returns The operations, the page first; empty when the template names an unknown paper size.
 */
export const getTemplateOperations = (
  template: StationeryTemplate,
  createId: (prefix: string) => string
): DesignOperation[] => {
  const size = PAPER_SIZES.find((candidate) => candidate.id === template.paperSizeId)
  if (!size) return []
  const pageId = createId('page')
  const frameId = createId('frame')
  return [
    { kind: 'createPage', id: pageId, properties: { name: template.name } },
    {
      kind: 'create',
      id: frameId,
      type: 'frame',
      parentId: pageId,
      properties: {
        name: template.name,
        x: 0,
        y: 0,
        width: millimetresToPoints(size.width),
        height: millimetresToPoints(size.height),
        pageUnit: 'mm',
        fill: PAGE_FILL
      }
    },
    ...template.nodes.map((node, order): DesignOperation => ({
      kind: 'create',
      id: createId(node.type),
      type: node.type,
      parentId: frameId,
      order,
      properties: {
        ...node.properties,
        name: node.name,
        x: millimetresToPoints(node.x),
        y: millimetresToPoints(node.y),
        width: millimetresToPoints(node.width),
        height: millimetresToPoints(node.height),
        // A text box keeps its width and wraps, as a person drawing one does.
        ...(node.type === 'text' ? { textWrap: true } : {})
      }
    }))
  ]
}
