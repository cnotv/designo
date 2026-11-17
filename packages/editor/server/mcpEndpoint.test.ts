import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { accountDirectory, createAccountStore, type Account } from '@designo/auth'
import { createDocument } from '@designo/core'
import { writeDocument } from '@designo/storage'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  UnauthorizedError,
  type OAuthClientProvider
} from '@modelcontextprotocol/sdk/client/auth.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  OAuthClientInformationMixed,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approveInBrowser,
  createBrowser,
  obtainAgentTokens,
  postForm,
  startOAuthServer,
  startServerWithoutSignIn,
  type Browser,
  type OAuthServer
} from './oauthTestSupport.ts'

let app: OAuthServer

beforeEach(async () => {
  app = await startOAuthServer()
})

afterEach(async () => {
  await app.close()
})

const ONE_HOUR = 60 * 60 * 1000
const CALLBACK = 'http://127.0.0.1:8765/callback'

/** What a command-line agent keeps between the steps of its sign-in. */
const createAgentProvider = (): OAuthClientProvider & {
  authorizationUrl: () => URL | undefined
  savedTokens: () => OAuthTokens | undefined
} => {
  let information: OAuthClientInformationMixed | undefined
  let tokens: OAuthTokens | undefined
  let verifier = ''
  let sentTo: URL | undefined
  return {
    redirectUrl: CALLBACK,
    clientMetadata: {
      client_name: 'Test Agent',
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code']
    },
    clientInformation: () => information,
    saveClientInformation: (saved) => {
      information = saved
    },
    tokens: () => tokens,
    saveTokens: (saved) => {
      tokens = saved
    },
    redirectToAuthorization: (url) => {
      sentTo = url
    },
    saveCodeVerifier: (saved) => {
      verifier = saved
    },
    codeVerifier: () => verifier,
    authorizationUrl: () => sentTo,
    savedTokens: () => tokens
  }
}

const connectedClient = async (provider: OAuthClientProvider): Promise<Client> => {
  const client = new Client({ name: 'test-agent', version: '0.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), { authProvider: provider })
  )
  return client
}

/** The whole login an agent does: discovery, registration, the browser, the code, the tokens. */
const signInThroughMcpClient = async (identity: string, browser?: Browser) => {
  const provider = createAgentProvider()
  const transport = new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
    authProvider: provider
  })
  const firstTry = new Client({ name: 'test-agent', version: '0.0.0' }).connect(transport)
  await expect(firstTry).rejects.toBeInstanceOf(UnauthorizedError)
  const authorizeUrl = provider.authorizationUrl()
  if (!authorizeUrl) throw new Error('The client never asked the browser to open')
  const redirect = await approveInBrowser(
    browser ?? createBrowser(app.origin),
    app.origin,
    authorizeUrl.href,
    identity
  )
  await transport.finishAuth(redirect.searchParams.get('code') ?? '')
  return { provider, authorizeUrl, redirect, client: await connectedClient(provider) }
}

const accountOf = async (email: string): Promise<Account> => {
  const [account] = await createAccountStore(app.dataDirectory).findByEmail(email)
  if (!account) throw new Error(`No account for ${email}`)
  return account
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>): string =>
  z
    .object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })) })
    .parse(result)
    .content.map((part) => part.text ?? '')
    .join('')

const callTool = (client: Client, name: string, argumentsObject: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: argumentsObject })

const rpc = (
  accessToken: string | undefined,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  fetch(`${app.origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    },
    body: JSON.stringify(body)
  })

const LIST_FILES_CALL = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'list_files', arguments: {} }
}

describe('an agent signing in through a real MCP client', () => {
  it('discovers, registers, signs in with Google, is approved in the browser and works on its designs', async () => {
    const { provider, authorizeUrl, redirect, client } = await signInThroughMcpClient('admin')

    expect(authorizeUrl.origin).toBe(app.origin)
    expect(authorizeUrl.pathname).toBe('/authorize')
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizeUrl.searchParams.get('resource')).toBe(`${app.origin}/mcp`)
    expect(redirect.href.startsWith(`${CALLBACK}?code=`)).toBe(true)
    expect(provider.savedTokens()).toMatchObject({ token_type: 'Bearer' })

    const tools = (await client.listTools()).tools.map((tool) => tool.name)
    expect(tools).toEqual(
      expect.arrayContaining([
        'list_files',
        'create_file',
        'create_node',
        'get_document_tree',
        'apply_ops'
      ])
    )

    const created = JSON.parse(
      textOf(await callTool(client, 'create_file', { name: 'Agent made' }))
    )
    const ada = await accountOf('admin@example.com')
    const folder = accountDirectory(app.dataDirectory, ada.id)
    await expect(
      access(path.join(folder, `${created.fileId}.designo.json`))
    ).resolves.toBeUndefined()
    await expect(readdir(app.dataDirectory)).resolves.not.toContain(
      `${created.fileId}.designo.json`
    )

    await callTool(client, 'create_node', {
      fileId: created.fileId,
      type: 'rectangle',
      parentId: created.pageId,
      properties: { x: 10, y: 20, width: 100, height: 50 }
    })
    const files = JSON.parse(textOf(await callTool(client, 'list_files')))
    expect(files).toEqual([expect.objectContaining({ id: created.fileId, name: 'Agent made' })])
    const tree = textOf(await callTool(client, 'get_document_tree', { fileId: created.fileId }))
    expect(tree).toContain('rectangle')
  })

  it('also shows those designs to the same account in the browser, through the files API', async () => {
    const browser = createBrowser(app.origin)
    const { client } = await signInThroughMcpClient('admin', browser)
    await callTool(client, 'create_file', { name: 'Shared view' })
    const listed = await browser.send(`${app.origin}/api/files`)
    expect(await listed.json()).toEqual([expect.objectContaining({ name: 'Shared view' })])
  })

  it('keeps working after the browser signs out: tokens do not depend on the cookie', async () => {
    const browser = createBrowser(app.origin)
    const { client } = await signInThroughMcpClient('admin', browser)
    const out = await browser.send(`${app.origin}/auth/logout`, {
      method: 'POST',
      headers: { Origin: app.origin }
    })
    expect(out.status).toBe(204)
    expect((await browser.send(`${app.origin}/api/me`)).status).toBe(401)
    expect(JSON.parse(textOf(await callTool(client, 'list_files')))).toEqual([])
  })

  it('refreshes by itself when its access token has expired', async () => {
    const { provider, client } = await signInThroughMcpClient('admin')
    const before = provider.savedTokens()?.access_token
    app.time.now += ONE_HOUR
    const again = await connectedClient(provider)
    expect(JSON.parse(textOf(await callTool(again, 'list_files')))).toEqual([])
    expect(provider.savedTokens()?.access_token).not.toBe(before)
    await client.close()
  })
})

describe('every call is scoped to the token account', () => {
  const signedInPair = async () => {
    const ada = await signInThroughMcpClient('admin')
    const fay = await signInThroughMcpClient('friend')
    return { ada: ada.client, fay: fay.client }
  }

  it('shows each account only its own designs', async () => {
    const { ada, fay } = await signedInPair()
    await callTool(ada, 'create_file', { name: 'Ada private' })
    await callTool(fay, 'create_file', { name: 'Fay private' })
    expect(
      JSON.parse(textOf(await callTool(ada, 'list_files'))).map(
        (file: { name: string }) => file.name
      )
    ).toEqual(['Ada private'])
    expect(
      JSON.parse(textOf(await callTool(fay, 'list_files'))).map(
        (file: { name: string }) => file.name
      )
    ).toEqual(['Fay private'])
  })

  it('cannot reach another account by file id, however the id is written', async () => {
    const { ada, fay } = await signedInPair()
    const secret = JSON.parse(textOf(await callTool(ada, 'create_file', { name: 'Ada secret' })))
    const adaAccount = await accountOf('admin@example.com')
    const fayFolder = accountDirectory(
      app.dataDirectory,
      (await accountOf('friend@team.example.com')).id
    )
    await writeFile(path.join(app.dataDirectory, 'rootfile.designo.json'), '{"root":"data"}')

    const attempts = [
      secret.fileId,
      `../${adaAccount.id}/${secret.fileId}`,
      `../../accounts/${adaAccount.id}/${secret.fileId}`,
      `..%2F${adaAccount.id}%2F${secret.fileId}`,
      `${adaAccount.id}/${secret.fileId}`,
      path.join(accountDirectory(app.dataDirectory, adaAccount.id), secret.fileId),
      '../rootfile',
      '../../accounts',
      '../accounts',
      '..\\..\\accounts.json',
      '/etc/passwd',
      'rootfile',
      `${secret.fileId}.designo.json`,
      `${secret.fileId}\u0000`
    ]
    const outcomes = await Promise.all(
      attempts.map(async (fileId) => {
        const result = await fay
          .callTool({ name: 'get_document_tree', arguments: { fileId } })
          .then((value) => ({
            ok: true as const,
            text: textOf(value),
            isError: Boolean(value.isError)
          }))
          .catch((error: unknown) => ({ ok: false as const, text: String(error), isError: true }))
        return { fileId, ...result }
      })
    )
    outcomes.forEach((outcome) => {
      expect(outcome.isError, outcome.fileId).toBe(true)
      expect(outcome.text).not.toContain('Ada secret')
      expect(outcome.text).not.toContain('"root"')
    })
    const written = await Promise.all(
      attempts.flatMap((fileId) =>
        [
          fay.callTool({
            name: 'apply_ops',
            arguments: { fileId, operations: [{ kind: 'delete', id: 'node-1' }] }
          }),
          fay.callTool({
            name: 'create_node',
            arguments: { fileId, type: 'frame', parentId: 'page' }
          })
        ].map((call) => call.then((value) => Boolean(value.isError)).catch(() => true))
      )
    )
    expect(written.every(Boolean)).toBe(true)
    // Nothing of Ada's changed and nothing was written outside the two account folders.
    expect(
      await readFile(
        path.join(
          accountDirectory(app.dataDirectory, adaAccount.id),
          `${secret.fileId}.designo.json`
        ),
        'utf8'
      )
    ).toContain('Ada secret')
    expect(await readdir(fayFolder).catch(() => [])).toEqual([])
    expect((await readdir(app.dataDirectory)).toSorted()).toEqual(
      ['accounts', 'accounts.json', 'oauth.json', 'rootfile.designo.json'].toSorted()
    )
    void ada
  })

  it('cannot read files the server keeps in the data folder, and create_file never writes there', async () => {
    const { fay } = await signedInPair()
    await mkdir(app.dataDirectory, { recursive: true })
    await writeDocument(app.dataDirectory, createDocument('legacy', 'Legacy root file', 'page'))
    const listed = JSON.parse(textOf(await callTool(fay, 'list_files')))
    expect(listed).toEqual([])
    const read = await fay
      .callTool({ name: 'get_document_tree', arguments: { fileId: 'legacy' } })
      .catch(() => ({ isError: true }))
    expect(read.isError).toBe(true)
    await callTool(fay, 'create_file', { name: 'Mine' })
    expect(await readdir(app.dataDirectory)).not.toContain('Mine.designo.json')
  })
})

describe('the token decides, on every request', () => {
  it('refuses a token as soon as its account is blocked and honours it again after unblock', async () => {
    const { client } = await signInThroughMcpClient('friend')
    expect(JSON.parse(textOf(await callTool(client, 'list_files')))).toEqual([])
    const accounts = createAccountStore(app.dataDirectory)
    const friend = await accountOf('friend@team.example.com')
    await accounts.setStatus(friend.id, 'blocked')
    await expect(callTool(client, 'list_files')).rejects.toThrow()
    await accounts.setStatus(friend.id, 'approved')
    expect(JSON.parse(textOf(await callTool(client, 'list_files')))).toEqual([])
  })

  it('refuses a token whose account is back to pending', async () => {
    const tokens = await obtainAgentTokens(app, 'friend')
    const friend = await accountOf('friend@team.example.com')
    await createAccountStore(app.dataDirectory).setStatus(friend.id, 'pending')
    expect((await rpc(tokens.accessToken, LIST_FILES_CALL)).status).toBe(401)
  })

  it('refuses a token after an hour, and accepts the refreshed one', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    expect((await rpc(tokens.accessToken, LIST_FILES_CALL)).status).toBe(200)
    app.time.now += ONE_HOUR
    expect((await rpc(tokens.accessToken, LIST_FILES_CALL)).status).toBe(401)
    const refreshed = await postForm(app.origin, '/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: tokens.clientId
    })
    const next = z.object({ access_token: z.string() }).parse(await refreshed.json())
    expect((await rpc(next.access_token, LIST_FILES_CALL)).status).toBe(200)
    expect((await rpc(tokens.accessToken, LIST_FILES_CALL)).status).toBe(401)
  })

  it('refuses a token that was revoked', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    await postForm(app.origin, '/revoke', { token: tokens.accessToken })
    expect((await rpc(tokens.accessToken, LIST_FILES_CALL)).status).toBe(401)
  })

  it('refuses every token of a grant once a refresh token is used twice', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    const refresh = (token: string) =>
      postForm(app.origin, '/token', {
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: tokens.clientId
      })
    const first = z
      .object({ access_token: z.string() })
      .parse(await (await refresh(tokens.refreshToken)).json())
    app.time.now += 30_000
    expect((await refresh(tokens.refreshToken)).status).toBe(400)
    expect((await rpc(first.access_token, LIST_FILES_CALL)).status).toBe(401)
  })

  it('does not take the browser session cookie for a login', async () => {
    const browser = createBrowser(app.origin)
    await browser.signInAs('admin')
    const response = await rpc(undefined, LIST_FILES_CALL, { Cookie: browser.cookieHeader() })
    expect(response.status).toBe(401)
  })
})

describe('refusals at /mcp', () => {
  const challenge = `Bearer resource_metadata="` // followed by the metadata URL

  it('answers a request with no token with 401 and where to sign in', async () => {
    const response = await rpc(undefined, LIST_FILES_CALL)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      `${challenge}${app.origin}/.well-known/oauth-protected-resource/mcp"`
    )
    expect(response.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate')
  })

  it.each([
    ['a made-up token', `Bearer ${'a'.repeat(43)}`],
    ['a token that is empty', 'Bearer '],
    ['another scheme', 'Basic YWRtaW46YWRtaW4='],
    ['a token with odd characters', 'Bearer a b']
  ])('answers %s with 401 and invalid_token', async (_label, authorization) => {
    const response = await rpc(undefined, LIST_FILES_CALL, { Authorization: authorization })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('error="invalid_token"')
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${app.origin}/.well-known/oauth-protected-resource/mcp"`
    )
  })

  it('does not take a token from the query string', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    const response = await fetch(`${app.origin}/mcp?access_token=${tokens.accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify(LIST_FILES_CALL)
    })
    expect(response.status).toBe(401)
  })

  it('does not take a refresh token as an access token', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    expect((await rpc(tokens.refreshToken, LIST_FILES_CALL)).status).toBe(401)
  })

  it('answers GET and DELETE with 405 once signed in: there are no sessions to stream or end', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    const get = await fetch(`${app.origin}/mcp`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'text/event-stream' }
    })
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    const remove = await fetch(`${app.origin}/mcp`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
    expect(remove.status).toBe(405)
  })

  it('answers a body that is not JSON with 400 and one that is too large with 413', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    const notJson = await fetch(`${app.origin}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${tokens.accessToken}`
      },
      body: '{nope'
    })
    expect(notJson.status).toBe(400)
    const tooLarge = await rpc(tokens.accessToken, {
      ...LIST_FILES_CALL,
      padding: 'x'.repeat(1_100_000)
    })
    expect(tooLarge.status).toBe(413)
  })

  it('answers the calls of an authorized agent over plain HTTP too', async () => {
    const tokens = await obtainAgentTokens(app, 'admin')
    const response = await rpc(tokens.accessToken, LIST_FILES_CALL)
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(JSON.stringify(await response.json())).toContain('"result"')
  })

  it('does not exist with sign-in off', async () => {
    const off = await startServerWithoutSignIn()
    try {
      const response = await fetch(`${off.origin}/mcp`, { method: 'POST', body: '{}' })
      expect(await response.text()).toBe('static editor')
    } finally {
      await off.close()
    }
  })
})
