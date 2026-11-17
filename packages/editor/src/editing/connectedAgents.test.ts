import { describe, expect, it } from 'vitest'
import {
  connectionRoute,
  isConnectionsRefusal,
  readConnectionList,
  readDisconnectOutcome,
  removeConnection,
  sortConnectionsNewestFirst
} from './connectedAgents.ts'
import type { ConnectedAgent } from './types.ts'

const agent = (overrides: Partial<ConnectedAgent> = {}): ConnectedAgent => ({
  id: 'grant-1',
  clientName: 'Claude Code',
  connectedAt: '2026-03-04T10:20:30.000Z',
  expiresAt: '2026-04-03T10:20:30.000Z',
  ...overrides
})

describe('connectionRoute', () => {
  it('names the route of one agent', () => {
    expect(connectionRoute('grant-1')).toBe('/api/connections/grant-1')
  })

  it('encodes an id so it can never add a path segment', () => {
    expect(connectionRoute('a/b')).toBe('/api/connections/a%2Fb')
  })
})

describe('readConnectionList', () => {
  it('reads the agents of an answer, newest first', () => {
    const older = agent({ id: 'old', connectedAt: '2026-01-01T00:00:00.000Z' })
    const newer = agent({ id: 'new', connectedAt: '2026-02-01T00:00:00.000Z' })
    expect(readConnectionList(200, { connections: [older, newer] })).toEqual([newer, older])
  })

  it.each([
    ['a refusal', 401, { error: 'Sign in to use Designo' }],
    ['a status other than 200', 500, { connections: [] }],
    ['a body of the wrong shape', 200, { connections: 'nope' }],
    [
      'an agent with no name',
      200,
      { connections: [{ id: 'a', connectedAt: 'x', expiresAt: 'y' }] }
    ],
    ['no body', 200, undefined]
  ])('reads %s as no list', (_label, status, body) => {
    expect(readConnectionList(status, body)).toBeUndefined()
  })
})

describe('sortConnectionsNewestFirst', () => {
  it('orders by when the agent was connected and leaves the given list alone', () => {
    const agents = [
      agent({ id: 'a', connectedAt: '2026-01-01T00:00:00.000Z' }),
      agent({ id: 'b', connectedAt: '2026-03-01T00:00:00.000Z' }),
      agent({ id: 'c', connectedAt: '2026-02-01T00:00:00.000Z' })
    ]
    expect(sortConnectionsNewestFirst(agents).map((entry) => entry.id)).toEqual(['b', 'c', 'a'])
    expect(agents.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('removeConnection', () => {
  it('drops one agent and keeps the others in order', () => {
    const agents = [agent({ id: 'a' }), agent({ id: 'b' }), agent({ id: 'c' })]
    expect(removeConnection(agents, 'b').map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('returns the same agents for an id that is not there', () => {
    const agents = [agent({ id: 'a' })]
    expect(removeConnection(agents, 'zzz')).toEqual(agents)
  })
})

describe('readDisconnectOutcome', () => {
  it('counts 204 as removed, and 404 too: the agent is gone either way', () => {
    expect(readDisconnectOutcome(204)).toBe('removed')
    expect(readDisconnectOutcome(404)).toBe('removed')
  })

  it.each([401, 403])('counts %i as the visitor having lost access', (status) => {
    expect(readDisconnectOutcome(status)).toBe('refused')
  })

  it.each([400, 500, 0])('counts %i as failed', (status) => {
    expect(readDisconnectOutcome(status)).toBe('failed')
  })
})

describe('isConnectionsRefusal', () => {
  it.each([401, 403])('counts %i as losing access', (status) => {
    expect(isConnectionsRefusal(status)).toBe(true)
  })

  it.each([200, 404, 500])('does not count %i', (status) => {
    expect(isConnectionsRefusal(status)).toBe(false)
  })
})
