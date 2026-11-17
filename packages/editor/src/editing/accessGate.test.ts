import { describe, expect, it } from 'vitest'
import { decideGateScreen, isAccessRefusal, readAccessAnswer } from './accessGate.ts'
import type { AccessAnswer } from './types.ts'

const account = (status: 'pending' | 'approved' | 'blocked'): AccessAnswer => ({
  kind: 'account',
  email: 'sam@example.com',
  name: 'Sam',
  status
})

describe('readAccessAnswer', () => {
  it('reads the answer of a server with sign-in off as nothing to gate', () => {
    expect(readAccessAnswer(200, { authEnabled: false })).toEqual({ kind: 'not-required' })
  })

  it('reads 401 as signed out, whatever the body', () => {
    expect(readAccessAnswer(401, { error: 'Not signed in' })).toEqual({ kind: 'signed-out' })
    expect(readAccessAnswer(401, undefined)).toEqual({ kind: 'signed-out' })
  })

  it.each(['pending', 'approved', 'blocked'] as const)('reads a %s account', (status) => {
    const body = { email: 'sam@example.com', name: 'Sam', status, isAdmin: false }
    expect(readAccessAnswer(200, body)).toEqual(account(status))
  })

  it.each([
    ['a static host answering with HTML', 200, undefined],
    ['a missing route', 404, { error: 'Not found' }],
    ['a server error', 500, { error: 'Internal error' }],
    ['an unknown status', 200, { email: 'a@example.com', name: 'A', status: 'root' }],
    ['a body of the wrong shape', 200, ['nope']]
  ])('treats %s as nothing to gate, never an error', (_label, status, body) => {
    expect(readAccessAnswer(status, body)).toEqual({ kind: 'not-required' })
  })
})

describe('decideGateScreen', () => {
  it('shows the editor without a gate when sign-in is not required', () => {
    expect(decideGateScreen({ kind: 'not-required' }, '')).toEqual({ screen: 'editor' })
    expect(decideGateScreen({ kind: 'not-required' }, '?sign_in=failed')).toEqual({
      screen: 'editor'
    })
  })

  it('shows the sign-in card when signed out', () => {
    expect(decideGateScreen({ kind: 'signed-out' }, '')).toEqual({
      screen: 'signed-out',
      signInFailed: false
    })
  })

  it('adds the failure message only for ?sign_in=failed', () => {
    const failed = { screen: 'signed-out', signInFailed: true }
    expect(decideGateScreen({ kind: 'signed-out' }, '?sign_in=failed')).toEqual(failed)
    expect(decideGateScreen({ kind: 'signed-out' }, '?a=1&sign_in=failed')).toEqual(failed)
    expect(decideGateScreen({ kind: 'signed-out' }, '?sign_in=other')).toMatchObject({
      signInFailed: false
    })
  })

  it('shows the waiting screen with the email for a pending account', () => {
    expect(decideGateScreen(account('pending'), '')).toEqual({
      screen: 'pending',
      email: 'sam@example.com'
    })
  })

  it('shows the refusal for a blocked account', () => {
    expect(decideGateScreen(account('blocked'), '')).toEqual({
      screen: 'blocked',
      email: 'sam@example.com'
    })
  })

  it('shows the editor for an approved account', () => {
    expect(decideGateScreen(account('approved'), '')).toEqual({ screen: 'editor' })
  })
})

describe('isAccessRefusal', () => {
  it.each([401, 403])('counts %i as a refusal', (status) => {
    expect(isAccessRefusal(status)).toBe(true)
  })

  it.each([200, 204, 400, 404, 500])('does not count %i', (status) => {
    expect(isAccessRefusal(status)).toBe(false)
  })
})
