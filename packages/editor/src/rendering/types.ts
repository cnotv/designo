import type { Bounds, SnapGuide } from '../editing/types.ts'

export interface OverlayState {
  selection: readonly string[]
  hoveredId: string | undefined
  marquee: Bounds | undefined
  showHandles: boolean
  color: string
  guides: readonly SnapGuide[]
  guideColor: string
}
