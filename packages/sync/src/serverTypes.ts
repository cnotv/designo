import type { AppliedBatch, GenerateId, OperationInput } from '@designo/storage'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Awareness } from 'y-protocols/awareness'
import type * as Y from 'yjs'
import type { DesignDocument } from '@designo/core'
import type { PresenceEntry } from './types.ts'

/** How often a room looks at its file and how long it gathers changes before saving. */
export interface RoomTimings {
  pollMilliseconds: number
  saveDelayMilliseconds: number
  presenceDelayMilliseconds: number
}

/** The live state of one open file. */
export interface SyncRoom {
  yDocument: Y.Doc
  awareness: Awareness
  /** Saves what is pending now, and resolves once it is on disk. */
  flush: () => Promise<void>
  /** Resolves once changes another process wrote to the file are in the room. */
  whenIdle: () => Promise<void>
  /** The document as the room last saved or read it. */
  savedDocument: () => DesignDocument
  /** Saves, clears presence and lets go of the file. */
  close: () => Promise<void>
}

/** One server's live rooms, shared by its WebSocket route, its files API and its MCP tools. */
export interface SyncHub {
  /** Takes over an upgrade request the caller has already authorised for this file. */
  handleUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    room: { dataDirectory: string; fileId: string }
  ) => void
  /** Applies a batch through the live room when the file is open, else straight to the file. */
  applyOperations: (
    dataDirectory: string,
    fileId: string,
    operations: readonly OperationInput[],
    generateId: GenerateId
  ) => Promise<AppliedBatch>
  /** Everyone on the file now; empty when nobody has it open. */
  getPresence: (dataDirectory: string, fileId: string) => PresenceEntry[]
  /** Saves and closes every room and connection. */
  close: () => Promise<void>
}

/** Optional overrides, used by tests to make the timers short. */
export interface SyncHubOptions {
  timings?: Partial<RoomTimings>
}
