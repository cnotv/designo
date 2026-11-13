import type { Bounds } from '../editing/types.ts'

export interface OverlayState {
  selection: readonly string[]
  hoveredId: string | undefined
  marquee: Bounds | undefined
  showHandles: boolean
  color: string
}
