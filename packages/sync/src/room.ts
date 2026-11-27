import { readDocument, readDocumentStamp, writeDocument } from '@designo/storage'
import type { DesignDocument } from '@designo/core'
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { isJsonEqual } from './jsonEquality.ts'
import { readLiveDocument, seedLiveDocument, writeLiveDocument } from './liveDocument.ts'
import { readPresence } from './presence.ts'
import { writePresenceFile } from './presenceFile.ts'
import { repairDocument } from './repair.ts'
import type { RoomTimings, SyncRoom } from './serverTypes.ts'

const isFromDisk = (origin: unknown): boolean =>
  typeof origin === 'object' && origin !== null && 'kind' in origin && origin.kind === 'disk'

/**
 * Opens the live room of one file: loads the file, saves every change back to it, and picks up
 * changes another process writes to it.
 * @param dataDirectory - Where Designo files live.
 * @param fileId - The file.
 * @param timings - How often to look at the file and how long to gather changes before a save.
 * @returns The room.
 */
export const openRoom = async (
  dataDirectory: string,
  fileId: string,
  timings: RoomTimings
): Promise<SyncRoom> => {
  const yDocument = new Y.Doc()
  const awareness = new Awareness(yDocument)
  // The server is not a participant, so it publishes no presence of its own.
  awareness.setLocalState(null)
  const stored = await readDocument(dataDirectory, fileId)
  seedLiveDocument(yDocument, stored, { kind: 'disk' })
  // What the file holds as far as this room knows; disk changes are merged against it.
  let lastSaved: DesignDocument = stored
  let lastStamp = await readDocumentStamp(dataDirectory, fileId)
  let queue: Promise<void> = Promise.resolve()
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let presenceTimer: ReturnType<typeof setTimeout> | undefined

  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch((error: unknown) => {
      console.error(`Sync room ${fileId}: ${error instanceof Error ? error.message : 'failed'}`)
    })
    return queue
  }

  // Only what changed on disk since the last save is written, so live edits that have not
  // reached the file yet survive a write from another process.
  const pickUpDiskChanges = async (): Promise<void> => {
    const stamp = await readDocumentStamp(dataDirectory, fileId)
    if (stamp === undefined || stamp === lastStamp) return
    const fromDisk = await readDocument(dataDirectory, fileId)
    lastStamp = stamp
    writeLiveDocument(yDocument, lastSaved, fromDisk, { kind: 'disk' })
    lastSaved = fromDisk
  }

  const save = async (): Promise<void> => {
    await pickUpDiskChanges()
    const merged = readLiveDocument(yDocument)
    if (!merged) {
      console.error(`Sync room ${fileId}: the merged document is not valid, so it was not saved`)
      return
    }
    const repaired = repairDocument(merged)
    if (!isJsonEqual(repaired, merged)) {
      writeLiveDocument(yDocument, merged, repaired, { kind: 'repair' })
    }
    if (isJsonEqual(repaired, lastSaved)) return
    await writeDocument(dataDirectory, repaired)
    lastSaved = repaired
    lastStamp = await readDocumentStamp(dataDirectory, fileId)
  }

  const scheduleSave = (): void => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void enqueue(save), timings.saveDelayMilliseconds)
  }
  yDocument.on('update', (_update: Uint8Array, origin: unknown) => {
    if (!isFromDisk(origin)) scheduleSave()
  })

  const savePresence = (): Promise<void> =>
    writePresenceFile(dataDirectory, fileId, readPresence(awareness), Date.now()).catch(() => {
      // Presence is a convenience for agents in other processes; the room works without it.
    })
  awareness.on('update', () => {
    if (presenceTimer !== undefined) return
    presenceTimer = setTimeout(() => {
      presenceTimer = undefined
      void savePresence()
    }, timings.presenceDelayMilliseconds)
  })

  const pollTimer = setInterval(() => void enqueue(pickUpDiskChanges), timings.pollMilliseconds)

  const flush = (): Promise<void> => {
    clearTimeout(saveTimer)
    return enqueue(save)
  }

  let closing: Promise<void> | undefined
  const close = async (): Promise<void> => {
    clearInterval(pollTimer)
    clearTimeout(presenceTimer)
    await flush()
    removeAwarenessStates(awareness, [...awareness.getStates().keys()], 'close')
    await savePresence()
    awareness.destroy()
    yDocument.destroy()
  }

  return {
    yDocument,
    awareness,
    flush,
    whenIdle: () => enqueue(pickUpDiskChanges),
    savedDocument: () => lastSaved,
    // A room can be closed by its last connection and by the hub at once; it closes once.
    close: () => {
      closing ??= close()
      return closing
    }
  }
}
