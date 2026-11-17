import { createAccountStore } from '@designo/auth'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createBrowser,
  obtainAgentTokens,
  startOAuthServer,
  type OAuthServer
} from './oauthTestSupport.ts'

let app: OAuthServer

beforeEach(async () => {
  app = await startOAuthServer()
})

afterEach(async () => {
  await app.close()
})

const connectionListSchema = z.object({
  connections: z.array(
    z.object({
      id: z.string(),
      clientName: z.string(),
      connectedAt: z.string(),
      expiresAt: z.string()
    })
  )
})

const listConnections = async (browser: ReturnType<typeof createBrowser>) => {
  const response = await browser.send(`${app.origin}/api/connections`)
  return { status: response.status, body: await response.json() }
}

const disconnect = (
  browser: ReturnType<typeof createBrowser>,
  id: string,
  headers: Record<string, string> = { Origin: app.origin }
) => browser.send(`${app.origin}/api/connections/${id}`, { method: 'DELETE', headers })

const mcpCall = (accessToken: string) =>
  fetch(`${app.origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_files', arguments: {} }
    })
  })

const signedInWithAgent = async (identity: string) => {
  const browser = createBrowser(app.origin)
  const agent = await obtainAgentTokens(app, identity, browser)
  return { browser, agent }
}

describe('GET /api/connections', () => {
  it('refuses a visitor who is not signed in', async () => {
    const response = await fetch(`${app.origin}/api/connections`)
    expect(response.status).toBe(401)
  })

  it('lists the agents of the account, with nothing that could be used as a credential', async () => {
    const { browser, agent } = await signedInWithAgent('admin')
    const { status, body } = await listConnections(browser)
    expect(status).toBe(200)
    const parsed = connectionListSchema.parse(body)
    expect(parsed.connections).toEqual([
      {
        id: expect.any(String),
        clientName: 'Test Agent',
        connectedAt: new Date(app.time.now).toISOString(),
        expiresAt: new Date(app.time.now + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    ])
    const text = JSON.stringify(body)
    expect(text).not.toContain(agent.accessToken)
    expect(text).not.toContain(agent.refreshToken)
    expect(text).not.toContain(agent.clientId)
    expect(text).not.toMatch(/[\da-f]{64}/)
  })

  it('shows an account only its own agents', async () => {
    const ada = await signedInWithAgent('admin')
    const fay = await signedInWithAgent('friend')
    await obtainAgentTokens(app, 'friend', fay.browser)
    const adaList = connectionListSchema.parse((await listConnections(ada.browser)).body)
    const fayList = connectionListSchema.parse((await listConnections(fay.browser)).body)
    expect(adaList.connections).toHaveLength(1)
    expect(fayList.connections).toHaveLength(2)
    const adaIds = new Set(adaList.connections.map((connection) => connection.id))
    expect(fayList.connections.some((connection) => adaIds.has(connection.id))).toBe(false)
  })

  it('refuses a blocked account and one still waiting for approval', async () => {
    const { browser } = await signedInWithAgent('friend')
    const accounts = createAccountStore(app.dataDirectory)
    const [friend] = await accounts.findByEmail('friend@team.example.com')
    await accounts.setStatus(friend?.id ?? '', 'blocked')
    expect((await listConnections(browser)).status).toBe(403)
    await accounts.setStatus(friend?.id ?? '', 'pending')
    expect((await listConnections(browser)).status).toBe(403)
  })

  it('answers other methods with 405', async () => {
    const { browser } = await signedInWithAgent('admin')
    const response = await browser.send(`${app.origin}/api/connections`, {
      method: 'POST',
      headers: { Origin: app.origin }
    })
    expect(response.status).toBe(405)
  })
})

describe('DELETE /api/connections/<id>', () => {
  const firstConnectionId = async (browser: ReturnType<typeof createBrowser>) =>
    connectionListSchema.parse((await listConnections(browser)).body).connections[0]?.id ?? ''

  it('disconnects the agent at once: its token stops working and it leaves the list', async () => {
    const { browser, agent } = await signedInWithAgent('admin')
    expect((await mcpCall(agent.accessToken)).status).toBe(200)
    const response = await disconnect(browser, await firstConnectionId(browser))
    expect(response.status).toBe(204)
    expect((await mcpCall(agent.accessToken)).status).toBe(401)
    expect(connectionListSchema.parse((await listConnections(browser)).body).connections).toEqual(
      []
    )
    const refresh = await fetch(`${app.origin}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: agent.refreshToken,
        client_id: agent.clientId
      }).toString()
    })
    expect(refresh.status).toBe(400)
  })

  it('refuses to disconnect somebody else agent, and says only that there is no such agent', async () => {
    const ada = await signedInWithAgent('admin')
    const fay = await signedInWithAgent('friend')
    const fayConnection = await firstConnectionId(fay.browser)
    const response = await disconnect(ada.browser, fayConnection)
    expect(response.status).toBe(404)
    expect((await mcpCall(fay.agent.accessToken)).status).toBe(200)
    expect(
      connectionListSchema.parse((await listConnections(fay.browser)).body).connections
    ).toHaveLength(1)
  })

  it('refuses a request that names another site as its origin', async () => {
    const { browser, agent } = await signedInWithAgent('admin')
    const response = await disconnect(browser, await firstConnectionId(browser), {
      Origin: 'https://evil.example.com'
    })
    expect(response.status).toBe(403)
    expect((await mcpCall(agent.accessToken)).status).toBe(200)
  })

  it('refuses a visitor who is not signed in', async () => {
    const { browser, agent } = await signedInWithAgent('admin')
    const id = await firstConnectionId(browser)
    const response = await disconnect(createBrowser(app.origin), id)
    expect(response.status).toBe(401)
    expect((await mcpCall(agent.accessToken)).status).toBe(200)
  })

  it.each(['unknown-id', '..%2Fapi%2Fme', '%00', 'a'.repeat(100), 'a%20b', '.'])(
    'answers 404 for the id %j',
    async (id) => {
      const { browser } = await signedInWithAgent('admin')
      expect((await disconnect(browser, id)).status).toBe(404)
    }
  )

  it('answers 404 the second time, and other methods with 405', async () => {
    const { browser } = await signedInWithAgent('admin')
    const id = await firstConnectionId(browser)
    expect((await disconnect(browser, id)).status).toBe(204)
    expect((await disconnect(browser, id)).status).toBe(404)
    const wrongMethod = await browser.send(`${app.origin}/api/connections/${id}`, {
      method: 'GET'
    })
    expect(wrongMethod.status).toBe(405)
  })
})
