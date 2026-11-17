import { ref } from 'vue'
import {
  ACCESS_ROUTE,
  decideGateScreen,
  readAccessAnswer,
  SIGN_OUT_ROUTE
} from '../editing/accessGate.ts'
import type { AccessAnswer, GateScreen } from '../editing/types.ts'
import type { AccessGate } from './types.ts'

// Without a server there is nobody to ask, so the editor opens as it does on a static host.
const fetchAccessAnswer = async (): Promise<AccessAnswer> => {
  const response = await fetch(ACCESS_ROUTE).catch(() => undefined)
  if (!response) return { kind: 'not-required' }
  const body: unknown = await response.json().catch(() => undefined)
  return readAccessAnswer(response.status, body)
}

/**
 * Asks the server who is visiting and decides which screen to show: the editor, or the sign-in,
 * waiting-for-approval or blocked screen in front of it.
 * @returns The screen, a way to ask again, and a way to sign out.
 */
export const useAccessGate = (): AccessGate => {
  const screen = ref<GateScreen>({ screen: 'loading' })

  const recheck = async (): Promise<void> => {
    screen.value = decideGateScreen(await fetchAccessAnswer(), window.location.search)
  }

  const signOut = async (): Promise<void> => {
    await fetch(SIGN_OUT_ROUTE, { method: 'POST' }).catch(() => undefined)
    window.location.reload()
  }

  void recheck()

  return { screen, recheck, signOut }
}
