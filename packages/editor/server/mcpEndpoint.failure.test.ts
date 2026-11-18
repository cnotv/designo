import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { obtainAgentTokens, startOAuthServer, type OAuthServer } from './oauthTestSupport.ts'

// The tools catch their own failures; this is about what happens when the machinery around them fails.
vi.mock('@designo/mcp', () => ({
  createDesignoServer: () => {
    throw new Error('the server could not be built')
  }
}))

let app: OAuthServer

beforeEach(async () => {
  app = await startOAuthServer()
})

afterEach(async () => {
  await app.close()
})

describe('/mcp when building the tools fails', () => {
  it('answers a JSON-RPC error the agent can read, logs it, and keeps serving', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { accessToken } = await obtainAgentTokens(app, 'admin')
    const call = () =>
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

    const first = await call()
    expect(first.status).toBe(500)
    expect(await first.json()).toEqual({
      jsonrpc: '2.0',
      error: { code: -32_603, message: expect.stringContaining('could not run the tool') },
      id: null
    })
    expect(logged).toHaveBeenCalledWith('MCP request failed: Error')
    expect((await call()).status).toBe(500)
    expect((await fetch(`${app.origin}/api/me`)).status).toBe(401)
    logged.mockRestore()
  })
})
