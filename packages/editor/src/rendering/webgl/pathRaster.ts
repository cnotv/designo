import type { DesignNode } from '@designo/core'

// Room for the anti-aliased edge, so it is never cut off at the texture's border.
const EDGE_PADDING = 1

/**
 * How far a path's raster reaches past its box on every side: half of its stroke, which is
 * centred on the outline, and a pixel of edge.
 * @param node - The path node.
 * @returns The padding in world units.
 */
export const getPathRasterPadding = (node: DesignNode): number =>
  EDGE_PADDING + (node.stroke ? node.strokeWidth / 2 : 0)

/**
 * Names a path raster by everything that changes its pixels, so paths that look alike share a
 * texture wherever they sit.
 * @param node - The path node.
 * @param rasterScale - The zoom bucket, from `bucketRasterScale`.
 * @returns The cache key.
 */
export const pathRasterKey = (node: DesignNode, rasterScale: number): string =>
  JSON.stringify([
    node.pathData,
    node.width,
    node.height,
    node.fill,
    node.stroke,
    node.strokeWidth,
    rasterScale
  ])
