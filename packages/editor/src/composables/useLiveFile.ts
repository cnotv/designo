import type { DesignDocument, DesignOperation } from '@designo/core'
import {
  applyOperationsToLiveDocument,
  presenceColor,
  publishPresence,
  readLiveDocument,
  readPresence,
  type LiveApplyResult,
  type PresenceEntry,
  type PresenceState
} from '@designo/sync'
import { onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { guestName } from '../editing/presence.ts'
import type { LiveFile } from './types.ts'

const SYNC_PATH = '/api/sync'

const syncServerUrl = (): string =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${SYNC_PATH}`

interface Connection {
  yDocument: Y.Doc
  provider: WebsocketProvider
}

const initialPresence = (): PresenceState => {
  const name = guestName(Math.floor(Math.random() * 1000))
  return { user: { name, color: presenceColor(name), kind: 'person' }, selection: [], cursor: null }
}

/**
 * Keeps the open file live: a Yjs copy synced with the server over a WebSocket, which carries
 * everyone's edits at once, and the presence of everyone on the file.
 * @param fileId - The open file.
 * @param enabled - False on a static host, where there is no server to connect to.
 * @param onDocument - Hears the file each time anyone changes it, once the copy is in sync.
 * @returns Whether the copy is live, the others' presence, and ways to edit and to publish.
 */
export const useLiveFile = (
  fileId: Readonly<Ref<string | undefined>>,
  enabled: Readonly<Ref<boolean>>,
  onDocument: (document: DesignDocument) => void
): LiveFile => {
  const isLive = ref(false)
  const presence = shallowRef<PresenceEntry[]>([])
  let connection: Connection | undefined
  let localPresence = initialPresence()

  const emitDocument = (yDocument: Y.Doc): void => {
    const document = readLiveDocument(yDocument)
    if (document) onDocument(document)
  }

  const disconnect = (): void => {
    connection?.provider.destroy()
    connection?.yDocument.destroy()
    connection = undefined
    isLive.value = false
    presence.value = []
  }

  const connect = (openFileId: string): void => {
    const yDocument = new Y.Doc()
    const provider = new WebsocketProvider(syncServerUrl(), openFileId, yDocument)
    provider.on('sync', (synced: boolean) => {
      isLive.value = synced
      if (synced) emitDocument(yDocument)
    })
    provider.on('status', ({ status }: { status: string }) => {
      if (status !== 'connected') isLive.value = false
    })
    yDocument.on('update', () => {
      if (isLive.value) emitDocument(yDocument)
    })
    provider.awareness.on('change', () => {
      presence.value = readPresence(provider.awareness, yDocument.clientID)
    })
    publishPresence(provider.awareness, localPresence)
    connection = { yDocument, provider }
  }

  watch(
    [fileId, enabled],
    ([openFileId, isEnabled]) => {
      disconnect()
      if (isEnabled && openFileId) connect(openFileId)
    },
    { immediate: true }
  )
  onScopeDispose(disconnect)

  return {
    isLive,
    presence,
    apply: (operations: readonly DesignOperation[]): LiveApplyResult | undefined =>
      connection && isLive.value
        ? applyOperationsToLiveDocument(connection.yDocument, operations, {
            kind: 'operations',
            clientId: connection.yDocument.clientID
          })
        : undefined,
    current: () => (connection ? readLiveDocument(connection.yDocument) : undefined),
    updatePresence: (change: Partial<PresenceState>) => {
      localPresence = { ...localPresence, ...change }
      if (connection) publishPresence(connection.provider.awareness, localPresence)
    },
    presenceUser: () => localPresence.user
  }
}
