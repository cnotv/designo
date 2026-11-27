import path from 'node:path'
import { applyOperationsToFile, prepareOperations } from '@designo/storage'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import { removeAwarenessStates } from 'y-protocols/awareness'
import { applyOperationsToLiveDocument } from './liveDocument.ts'
import { readPresence } from './presence.ts'
import {
  encodeAwarenessUpdate,
  encodeDocumentUpdate,
  encodeSyncStart,
  readClientMessage
} from './protocol.ts'
import { openRoom } from './room.ts'
import type { RoomTimings, SyncHub, SyncHubOptions, SyncRoom } from './serverTypes.ts'

export * from './presenceFile.ts'
export type * from './serverTypes.ts'

/** The path a client opens a file's live connection on, followed by `/<file id>`. */
export const SYNC_ROUTE = '/api/sync'

const DEFAULT_TIMINGS: RoomTimings = {
  pollMilliseconds: 500,
  saveDelayMilliseconds: 50,
  presenceDelayMilliseconds: 250
}

// The id the server's own edits carry: those of the files API and of agents on remote MCP.
const SERVER_CLIENT_ID = 0
const POLICY_VIOLATION = 1008

const roomKey = (dataDirectory: string, fileId: string): string =>
  path.join(path.resolve(dataDirectory), fileId)

const toBytes = (data: RawData): Uint8Array =>
  Array.isArray(data) ? new Uint8Array(Buffer.concat(data)) : new Uint8Array(data)

type Send = (message: Uint8Array) => void

const withEntry = <Value>(
  map: ReadonlyMap<string, Value>,
  key: string,
  value: Value
): ReadonlyMap<string, Value> => new Map([...map, [key, value]])

const withoutEntry = <Value>(
  map: ReadonlyMap<string, Value>,
  key: string
): ReadonlyMap<string, Value> => new Map([...map].filter(([entryKey]) => entryKey !== key))

const answerMessage = (socket: WebSocket, room: SyncRoom, data: RawData): void => {
  try {
    const reply = readClientMessage(toBytes(data), room, socket)
    if (reply && socket.readyState === socket.OPEN) socket.send(reply)
  } catch {
    socket.close(POLICY_VIOLATION, 'Malformed sync message')
  }
}

// Joins one connection to a room: sends it the room's state and presence, relays the others'
// changes to it, and drops its presence when it leaves.
const attachConnection = (
  socket: WebSocket,
  room: SyncRoom,
  onLeave: (send: Send) => void
): Send => {
  // The presence states this connection published, removed when it drops.
  let controlledClients: readonly number[] = []
  const send: Send = (message) => {
    if (socket.readyState === socket.OPEN) socket.send(message)
  }
  const trackClients = (changes: Record<'added' | 'removed', number[]>, origin: unknown): void => {
    if (origin !== socket) return
    controlledClients = [...controlledClients, ...changes.added].filter(
      (clientId) => !changes.removed.includes(clientId)
    )
  }
  room.awareness.on('update', trackClients)
  socket.on('close', () => {
    room.awareness.off('update', trackClients)
    removeAwarenessStates(room.awareness, [...controlledClients], null)
    onLeave(send)
  })
  send(encodeSyncStart(room.yDocument))
  const present = [...room.awareness.getStates().keys()]
  if (present.length > 0) send(encodeAwarenessUpdate(room.awareness, present))
  return send
}

/**
 * Starts the live-editing hub: one room per open file, kept in memory while someone is on it,
 * saved to the file after every change, and following changes other processes make to the file.
 * @param options - Shorter timers for tests.
 * @returns The hub.
 */
export const createSyncHub = (options: SyncHubOptions = {}): SyncHub => {
  const timings = { ...DEFAULT_TIMINGS, ...options.timings }
  const webSocketServer = new WebSocketServer({ noServer: true })
  let rooms: ReadonlyMap<string, Promise<SyncRoom>> = new Map()
  // The rooms that finished opening, so presence can be read without waiting.
  let openRooms: ReadonlyMap<string, SyncRoom> = new Map()
  // Each connection's way to send; a room closes when its last connection leaves.
  let connections: ReadonlyMap<string, readonly Send[]> = new Map()

  const broadcast = (key: string, message: Uint8Array): void =>
    (connections.get(key) ?? []).forEach((send) => send(message))

  // Wires a room's document and presence to its connections once, when the room opens.
  const relayRoom = (key: string, room: SyncRoom): void => {
    room.yDocument.on('update', (update: Uint8Array) =>
      broadcast(key, encodeDocumentUpdate(update))
    )
    room.awareness.on('update', (changes: Record<'added' | 'updated' | 'removed', number[]>) =>
      broadcast(
        key,
        encodeAwarenessUpdate(room.awareness, [
          ...changes.added,
          ...changes.updated,
          ...changes.removed
        ])
      )
    )
  }

  const roomFor = (dataDirectory: string, fileId: string): Promise<SyncRoom> => {
    const key = roomKey(dataDirectory, fileId)
    const existing = rooms.get(key)
    if (existing) return existing
    const opening = openRoom(dataDirectory, fileId, timings).then((room) => {
      relayRoom(key, room)
      openRooms = withEntry(openRooms, key, room)
      return room
    })
    rooms = withEntry(rooms, key, opening)
    opening.catch(() => {
      rooms = withoutEntry(rooms, key)
    })
    return opening
  }

  const leaveRoom = async (key: string, room: SyncRoom, send: Send): Promise<void> => {
    const remaining = (connections.get(key) ?? []).filter((other) => other !== send)
    connections =
      remaining.length > 0 ? withEntry(connections, key, remaining) : withoutEntry(connections, key)
    if (remaining.length > 0) return
    rooms = withoutEntry(rooms, key)
    openRooms = withoutEntry(openRooms, key)
    await room.close()
  }

  const joinRoom = (socket: WebSocket, key: string, room: SyncRoom): void => {
    const send = attachConnection(socket, room, (leaving) => void leaveRoom(key, room, leaving))
    connections = withEntry(connections, key, [...(connections.get(key) ?? []), send])
  }

  return {
    handleUpgrade: (request, socket, head, { dataDirectory, fileId }) => {
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        const joined = roomFor(dataDirectory, fileId).then((room) => {
          joinRoom(webSocket, roomKey(dataDirectory, fileId), room)
          return room
        })
        joined.catch(() => webSocket.close(POLICY_VIOLATION, 'Unknown file'))
        // A client speaks as soon as it connects, before the room has opened; chaining every
        // message on the opening keeps them all, in order.
        webSocket.on('message', (data) => {
          void joined.then(
            (room) => answerMessage(webSocket, room, data),
            () => undefined
          )
        })
      })
    },
    applyOperations: async (dataDirectory, fileId, operations, generateId) => {
      const opening = rooms.get(roomKey(dataDirectory, fileId))
      if (!opening) return applyOperationsToFile(dataDirectory, fileId, operations, generateId)
      const room = await opening
      await room.whenIdle()
      const prepared = prepareOperations(operations, generateId)
      const result = applyOperationsToLiveDocument(room.yDocument, prepared.operations, {
        kind: 'operations',
        clientId: SERVER_CLIENT_ID
      })
      if (!result.ok) throw new Error(result.error)
      await room.flush()
      return { document: room.savedDocument(), createdNodeIds: prepared.createdNodeIds }
    },
    getPresence: (dataDirectory, fileId) => {
      const room = openRooms.get(roomKey(dataDirectory, fileId))
      return room ? readPresence(room.awareness) : []
    },
    close: async () => {
      webSocketServer.clients.forEach((client) => client.terminate())
      const open = await Promise.all(rooms.values())
      rooms = new Map()
      openRooms = new Map()
      connections = new Map()
      await Promise.all(open.map((room) => room.close()))
      webSocketServer.close()
    }
  }
}
