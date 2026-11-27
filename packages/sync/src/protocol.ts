import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import type * as Y from 'yjs'

// The message types y-websocket clients speak.
const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1
const MESSAGE_QUERY_AWARENESS = 3

const encode = (write: (encoder: encoding.Encoder) => void): Uint8Array => {
  const encoder = encoding.createEncoder()
  write(encoder)
  return encoding.toUint8Array(encoder)
}

/**
 * Builds the first message to a new connection: the server's state vector, which asks the client
 * for what the server is missing.
 * @param yDocument - The room's live document.
 * @returns The encoded message.
 */
export const encodeSyncStart = (yDocument: Y.Doc): Uint8Array =>
  encode((encoder) => {
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, yDocument)
  })

/**
 * Builds the message that relays one document update to the other connections.
 * @param update - The Yjs update.
 * @returns The encoded message.
 */
export const encodeDocumentUpdate = (update: Uint8Array): Uint8Array =>
  encode((encoder) => {
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
  })

/**
 * Builds the message that tells connections about presence changes.
 * @param awareness - The room's awareness.
 * @param clientIds - The clients whose presence changed.
 * @returns The encoded message.
 */
export const encodeAwarenessUpdate = (
  awareness: awarenessProtocol.Awareness,
  clientIds: readonly number[]
): Uint8Array =>
  encode((encoder) => {
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, [...clientIds])
    )
  })

/**
 * Reads one message from a connection and applies it to the room.
 * @param message - The raw message.
 * @param room - The room's live document and awareness.
 * @param room.yDocument - The live document.
 * @param room.awareness - The presence of everyone in the room.
 * @param origin - The connection, recorded as the origin of what it changes.
 * @returns The answer to send back, if the message needs one.
 * @throws {Error} When the message is malformed.
 */
export const readClientMessage = (
  message: Uint8Array,
  room: { yDocument: Y.Doc; awareness: awarenessProtocol.Awareness },
  origin: unknown
): Uint8Array | undefined => {
  const decoder = decoding.createDecoder(message)
  const messageType = decoding.readVarUint(decoder)
  if (messageType === MESSAGE_SYNC) {
    const reply = encode((encoder) => {
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.readSyncMessage(decoder, encoder, room.yDocument, origin)
    })
    // A reply holding only its type byte has nothing to say.
    return reply.length > 1 ? reply : undefined
  }
  if (messageType === MESSAGE_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(
      room.awareness,
      decoding.readVarUint8Array(decoder),
      origin
    )
    return undefined
  }
  if (messageType === MESSAGE_QUERY_AWARENESS) {
    return encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()])
  }
  throw new Error(`Unknown sync message type ${messageType}`)
}
