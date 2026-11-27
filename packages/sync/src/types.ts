import type { DesignOperation } from '@designo/core'

/** Who a connection belongs to, shown to the others beside a cursor or a selection. */
export interface PresenceUser {
  name: string
  /** A CSS colour for the cursor and the selection outline. */
  color: string
  kind: 'person' | 'agent'
}

/** What one connection shares with the others on the same file. */
export interface PresenceState {
  user: PresenceUser
  /** The ids of the selected nodes. */
  selection: readonly string[]
  /** The pointer on the page, in design units; null when it is off the canvas. */
  cursor: { x: number; y: number } | null
}

/** One connection's presence, as `get_selection` reports it. */
export interface PresenceEntry extends PresenceState {
  clientId: number
}

/** Where a live change came from, so each client undoes only its own. */
export type ChangeOrigin = { kind: 'operations'; clientId: number } | { kind: 'repair' | 'disk' }

/** The outcome of applying operations to a live document. */
export type LiveApplyResult =
  { ok: true; operations: readonly DesignOperation[] } | { ok: false; error: string }
