import {
  DEFAULT_NODE_PROPERTIES,
  getPageGuideGeometry,
  type DesignNode,
  type GuideRectangle
} from '@designo/core'
import type { SceneItem } from './types.ts'

const BLEED_COLOR = '#f24822'
const MARGIN_COLOR = '#e5409a'
const COLUMN_COLOR = '#18a0fbaa'

interface GuideShape {
  idSuffix: string
  box: GuideRectangle
  stroke: string | null
  fill: string | null
  /** The stroke width; one screen pixel at the current zoom. */
  hairline: number
}

// Guides are scene items, not nodes of the document, so no operation, export or hit test sees them.
const guideItem = (
  frame: DesignNode,
  shape: GuideShape,
  clipFrames: SceneItem['clipFrames']
): SceneItem => ({
  node: {
    ...DEFAULT_NODE_PROPERTIES,
    id: `${frame.id}:guide:${shape.idSuffix}`,
    type: 'rectangle',
    parentId: frame.parentId,
    order: frame.order,
    x: frame.x + shape.box.x,
    y: frame.y + shape.box.y,
    width: shape.box.width,
    height: shape.box.height,
    fill: shape.fill,
    stroke: shape.stroke,
    strokeWidth: shape.hairline
  },
  clipFrames
})

/**
 * Works out the guide shapes to draw right after a frame, so they lie over its fill and under its
 * content. A frame that is turned gets none: the guides do not follow a rotation.
 * @param frameItem - A scene item; only a frame with a bleed or layout guides has any.
 * @param scale - The viewport's scale, which keeps every guide one screen pixel wide.
 * @returns The items to draw after the frame, in paint order.
 */
export const getPageGuideItems = ({ node, clipFrames }: SceneItem, scale: number): SceneItem[] => {
  if (node.type !== 'frame' || node.rotation !== 0 || (node.bleed === 0 && !node.guides)) return []
  const hairline = 1 / scale
  const geometry = getPageGuideGeometry(node)
  const outlines = (kind: string, boxes: readonly GuideRectangle[], stroke: string) =>
    boxes.map((box, index) =>
      guideItem(
        node,
        { idSuffix: `${kind}:${index}`, box, stroke, fill: null, hairline },
        clipFrames
      )
    )
  return [
    ...(geometry.bleed
      ? [
          guideItem(
            node,
            { idSuffix: 'bleed', box: geometry.bleed, stroke: BLEED_COLOR, fill: null, hairline },
            clipFrames
          )
        ]
      : []),
    ...outlines('margin', geometry.margins, MARGIN_COLOR),
    ...outlines('column', geometry.columns, COLUMN_COLOR),
    ...(geometry.fold === undefined
      ? []
      : [
          guideItem(
            node,
            {
              idSuffix: 'fold',
              box: { x: geometry.fold, y: 0, width: hairline, height: node.height },
              stroke: null,
              fill: MARGIN_COLOR,
              hairline: 0
            },
            clipFrames
          )
        ])
  ]
}
