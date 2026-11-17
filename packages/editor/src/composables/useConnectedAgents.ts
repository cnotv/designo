import { ref } from 'vue'
import {
  CONNECTIONS_ROUTE,
  connectionRoute,
  isConnectionsRefusal,
  readConnectionList,
  readDisconnectOutcome,
  removeConnection
} from '../editing/connectedAgents.ts'
import type { ConnectedAgent } from '../editing/types.ts'
import type { ConnectedAgents } from './types.ts'

const readJson = async (response: Response): Promise<unknown> =>
  response.json().catch(() => undefined)

/**
 * Loads the agents the signed-in account has approved and disconnects them on request.
 * @param onAccessRefused - Called when the server says the visitor is no longer signed in or
 * allowed, so the app can look at who the visitor is again.
 * @returns The agents, the state of the request and the ways to load and disconnect.
 */
export const useConnectedAgents = (onAccessRefused: () => void): ConnectedAgents => {
  const agents = ref<readonly ConnectedAgent[]>([])
  const isLoading = ref(false)
  const busyAgentId = ref<string>()
  const error = ref<string>()

  const load = async (): Promise<void> => {
    isLoading.value = true
    error.value = undefined
    const response = await fetch(CONNECTIONS_ROUTE).catch(() => undefined)
    const list = response
      ? readConnectionList(response.status, await readJson(response))
      : undefined
    isLoading.value = false
    if (list) {
      agents.value = list
      return
    }
    error.value = 'The connected agents could not be loaded.'
    if (response && isConnectionsRefusal(response.status)) onAccessRefused()
  }

  const disconnect = async (agentId: string): Promise<void> => {
    busyAgentId.value = agentId
    error.value = undefined
    const response = await fetch(connectionRoute(agentId), { method: 'DELETE' }).catch(
      () => undefined
    )
    const outcome = response ? readDisconnectOutcome(response.status) : 'failed'
    busyAgentId.value = undefined
    if (outcome === 'removed') {
      agents.value = removeConnection(agents.value, agentId)
      return
    }
    error.value = 'The agent could not be disconnected.'
    if (outcome === 'refused') onAccessRefused()
  }

  return { agents, isLoading, busyAgentId, error, load, disconnect }
}
