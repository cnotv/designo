import type { DesignDocument } from '@designo/core'

/** What the master select shows for a page that uses none. */
export const NO_MASTER = 'none'

/** One entry of the master select. */
export interface MasterChoice {
  value: string
  label: string
}

/**
 * Lists what a page frame can use as its master.
 * @param document - The document being edited.
 * @param frameId - The frame the select is for.
 * @returns "None", then every other frame marked as a master.
 */
export const getMasterChoices = (document: DesignDocument, frameId: string): MasterChoice[] => [
  { value: NO_MASTER, label: 'None' },
  ...Object.values(document.nodes)
    .filter((node) => node.type === 'frame' && node.isMaster === true && node.id !== frameId)
    .map((master) => ({ value: master.id, label: master.name || master.id }))
]

/**
 * Reads the master select's value.
 * @param raw - The value the select emitted.
 * @returns The master's id, null for none, or undefined when it was not text.
 */
export const readMasterChoice = (raw: unknown): string | null | undefined => {
  if (typeof raw !== 'string') return undefined
  return raw === NO_MASTER ? null : raw
}
