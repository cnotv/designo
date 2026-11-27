import type { Awareness } from 'y-protocols/awareness'
import { z } from 'zod'
import type { PresenceEntry, PresenceState } from './types.ts'

const MAX_SELECTION = 10_000
const MAX_NAME_LENGTH = 200

/** What a connection may publish as its presence; anything else is ignored. */
export const presenceStateSchema = z.object({
  user: z.object({
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    color: z.string().regex(/^#[\da-f]{6}$/i),
    kind: z.enum(['person', 'agent'])
  }),
  selection: z.array(z.string()).max(MAX_SELECTION),
  cursor: z.object({ x: z.number(), y: z.number() }).nullable()
})

/**
 * Lists the presence of every connection on a file, leaving out states that do not parse.
 * @param awareness - The file's awareness.
 * @param excludeClientId - A client to leave out, usually the reader's own.
 * @returns One entry per connection, ordered by client id.
 */
export const readPresence = (awareness: Awareness, excludeClientId?: number): PresenceEntry[] =>
  [...awareness.getStates()]
    .filter(([clientId]) => clientId !== excludeClientId)
    .flatMap(([clientId, state]) => {
      const parsed = presenceStateSchema.safeParse(state)
      return parsed.success ? [{ clientId, ...parsed.data }] : []
    })
    .toSorted((first, second) => first.clientId - second.clientId)

/**
 * Publishes this connection's presence.
 * @param awareness - The file's awareness.
 * @param state - Who this is, what they selected and where their pointer is.
 */
export const publishPresence = (awareness: Awareness, state: PresenceState): void => {
  awareness.setLocalState(state)
}

// A fixed set of colours that read on white and on the dark canvas alike.
const NAME_HASH_MULTIPLIER = 31

const PRESENCE_COLORS = [
  '#e5484d',
  '#f76b15',
  '#ffc53d',
  '#30a46c',
  '#12a594',
  '#0090ff',
  '#6e56cf',
  '#d6409f'
] as const

/**
 * Picks a stable colour for a name, so a person keeps their colour across reloads.
 * @param name - The person's or agent's name.
 * @returns A hex colour.
 */
export const presenceColor = (name: string): string => {
  const hash = [...name].reduce(
    (sum, character) => (sum * NAME_HASH_MULTIPLIER + character.charCodeAt(0)) >>> 0,
    0
  )
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length] ?? PRESENCE_COLORS[0]
}
