import { z } from 'zod'
import type { ConnectedAgent, DisconnectOutcome } from './types.ts'

export const CONNECTIONS_ROUTE = '/api/connections'

const HTTP_OK = 200
const HTTP_NO_CONTENT = 204
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_NOT_FOUND = 404

const connectedAgentSchema = z.object({
  id: z.string(),
  clientName: z.string(),
  connectedAt: z.string(),
  expiresAt: z.string()
})

const connectionListSchema = z.object({ connections: z.array(connectedAgentSchema) })

/**
 * Names the route that disconnects one agent.
 * @param agentId - The agent's id, which is encoded so it cannot add a path segment.
 * @returns The route.
 */
export const connectionRoute = (agentId: string): string =>
  `${CONNECTIONS_ROUTE}/${encodeURIComponent(agentId)}`

/**
 * Orders agents so the one connected last comes first.
 * @param agents - The agents as listed.
 * @returns A new list; the given one is untouched.
 */
export const sortConnectionsNewestFirst = (
  agents: readonly ConnectedAgent[]
): readonly ConnectedAgent[] =>
  [...agents].sort((first, second) => second.connectedAt.localeCompare(first.connectedAt))

/**
 * Reads the answer to "list my agents". Anything that is not clearly a list is no list.
 * @param status - The HTTP status of the answer.
 * @param body - The parsed JSON body, or undefined when there was none.
 * @returns The agents, newest first, or undefined when the answer is not a list.
 */
export const readConnectionList = (
  status: number,
  body: unknown
): readonly ConnectedAgent[] | undefined => {
  const parsed = connectionListSchema.safeParse(body)
  return status === HTTP_OK && parsed.success
    ? sortConnectionsNewestFirst(parsed.data.connections)
    : undefined
}

/**
 * Drops one agent from the list the screen shows.
 * @param agents - The agents as listed.
 * @param agentId - The agent that was disconnected.
 * @returns A new list without it.
 */
export const removeConnection = (
  agents: readonly ConnectedAgent[],
  agentId: string
): readonly ConnectedAgent[] => agents.filter((agent) => agent.id !== agentId)

/**
 * Says whether an answer means the visitor can no longer manage agents: they signed out, or the
 * account was blocked.
 * @param status - The HTTP status of the answer.
 * @returns True for 401 and 403.
 */
export const isConnectionsRefusal = (status: number): boolean =>
  status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN

/**
 * Reads the answer to a disconnect. An agent that is already gone, because it was disconnected
 * elsewhere, is what the visitor asked for, so it counts as removed.
 * @param status - The HTTP status of the answer.
 * @returns What happened.
 */
export const readDisconnectOutcome = (status: number): DisconnectOutcome => {
  if (status === HTTP_NO_CONTENT || status === HTTP_NOT_FOUND) return 'removed'
  return isConnectionsRefusal(status) ? 'refused' : 'failed'
}
