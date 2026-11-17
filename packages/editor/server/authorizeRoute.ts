import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createConsentToken,
  isWellFormedCodeChallenge,
  safeReturnPath,
  verifyConsentToken,
  type Account,
  type AuthorizationRequestFields,
  type OAuthClient
} from '@designo/auth'
import { accountFromRequest } from './authentication.ts'
import { AUTH_START_ROUTE } from './authRoutes.ts'
import { consentPageHeaders, renderConsentPage, renderErrorPage } from './consentPage.ts'
import { sendError, sendRedirect } from './http.ts'
import { readFormOrRefuse } from './oauthHttp.ts'
import { mcpResourceUrl } from './oauthMetadata.ts'
import type { AuthContext } from './types.ts'

const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_METHOD_NOT_ALLOWED = 405

const NONCE_BYTES = 16
const MAX_STATE_LENGTH = 512
const CONSENT_TOKEN_FIELD = 'consent_token'

interface RawParameters {
  client_id: readonly string[]
  redirect_uri: readonly string[]
  response_type: readonly string[]
  code_challenge: readonly string[]
  code_challenge_method: readonly string[]
  state: readonly string[]
  resource: readonly string[]
}

// A parameter that is repeated is ambiguous (RFC 6749 section 3.1), so each is read as a list and
// only a list of exactly one counts.
const readRawParameters = (params: URLSearchParams): RawParameters => ({
  client_id: params.getAll('client_id'),
  redirect_uri: params.getAll('redirect_uri'),
  response_type: params.getAll('response_type'),
  code_challenge: params.getAll('code_challenge'),
  code_challenge_method: params.getAll('code_challenge_method'),
  state: params.getAll('state'),
  resource: params.getAll('resource')
})

const onlyValue = (values: readonly string[]): string | undefined =>
  values.length === 1 ? values[0] : undefined

type CheckedRequest =
  /** The client or its redirect address cannot be trusted, so nobody is redirected there. */
  | { kind: 'page-error'; message: string }
  /** The request is understood well enough to answer by redirecting back with an error. */
  | {
      kind: 'redirect-error'
      redirectUri: string
      error: string
      description: string
      state: string | undefined
    }
  | { kind: 'valid'; client: OAuthClient; fields: AuthorizationRequestFields }

const redirectError = (
  redirectUri: string,
  state: string | undefined,
  error: string,
  description: string
): CheckedRequest => ({ kind: 'redirect-error', redirectUri, error, description, state })

const isOurResource = (context: AuthContext, resource: string): boolean =>
  URL.canParse(resource) &&
  new URL(resource).href === new URL(mcpResourceUrl(context.settings)).href

interface Problem {
  error: string
  description: string
}

// PKCE is not optional: without it a code taken from a loopback redirect is as good as a token.
const pkceProblem = (raw: RawParameters): Problem | undefined => {
  const codeChallenge = onlyValue(raw.code_challenge)
  return onlyValue(raw.code_challenge_method) === 'S256' &&
    codeChallenge !== undefined &&
    isWellFormedCodeChallenge(codeChallenge)
    ? undefined
    : { error: 'invalid_request', description: 'PKCE with code_challenge_method=S256 is required' }
}

const resourceProblem = (context: AuthContext, raw: RawParameters): Problem | undefined => {
  const resource = onlyValue(raw.resource)
  const isWrong =
    raw.resource.length > 1 || (resource !== undefined && !isOurResource(context, resource))
  return isWrong
    ? {
        error: 'invalid_target',
        description: `The only resource here is ${mcpResourceUrl(context.settings)}`
      }
    : undefined
}

const stateProblem = (raw: RawParameters): Problem | undefined => {
  const state = onlyValue(raw.state)
  return raw.state.length > 1 || (state !== undefined && state.length > MAX_STATE_LENGTH)
    ? { error: 'invalid_request', description: 'The state parameter is repeated or too long' }
    : undefined
}

const requestProblem = (context: AuthContext, raw: RawParameters): Problem | undefined =>
  stateProblem(raw) ??
  (onlyValue(raw.response_type) === 'code'
    ? undefined
    : {
        error: 'unsupported_response_type',
        description: 'Only response_type=code is supported'
      }) ??
  pkceProblem(raw) ??
  resourceProblem(context, raw)

const checkRedirectable = (
  context: AuthContext,
  raw: RawParameters,
  client: OAuthClient,
  redirectUri: string
): CheckedRequest => {
  const problem = requestProblem(context, raw)
  if (problem) {
    return redirectError(redirectUri, onlyValue(raw.state), problem.error, problem.description)
  }
  return {
    kind: 'valid',
    client,
    fields: {
      clientId: client.clientId,
      redirectUri,
      // Both were checked above, so they are present.
      codeChallenge: onlyValue(raw.code_challenge) ?? '',
      state: onlyValue(raw.state),
      resource: onlyValue(raw.resource)
    }
  }
}

const checkRequest = async (context: AuthContext, raw: RawParameters): Promise<CheckedRequest> => {
  const clientId = onlyValue(raw.client_id)
  const client = clientId ? await context.oauthStore.findClient(clientId) : undefined
  if (!client)
    return { kind: 'page-error', message: 'This application is not registered with Designo.' }
  const redirectUri = onlyValue(raw.redirect_uri)
  // An exact match against what the client registered: anything else could send a code to a
  // place the client never named.
  if (redirectUri === undefined || !client.redirectUris.includes(redirectUri)) {
    return {
      kind: 'page-error',
      message: 'The address this application asked to return to is not the one it registered.'
    }
  }
  return checkRedirectable(context, raw, client, redirectUri)
}

const sendPage = (
  response: ServerResponse,
  status: number,
  render: (nonce: string) => string
): void => {
  const nonce = randomBytes(NONCE_BYTES).toString('base64')
  response.statusCode = status
  Object.entries(consentPageHeaders(nonce)).forEach(([name, value]) => {
    response.setHeader(name, value)
  })
  response.end(render(nonce))
}

const sendErrorPage = (
  response: ServerResponse,
  status: number,
  title: string,
  message: string
): void => {
  sendPage(response, status, (nonce) => renderErrorPage(title, message, nonce))
}

const sendToClient = (
  response: ServerResponse,
  redirectUri: string,
  parameters: Readonly<Record<string, string | undefined>>
): void => {
  const target = new URL(redirectUri)
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== undefined) target.searchParams.set(name, value)
  })
  response.setHeader('Referrer-Policy', 'no-referrer')
  sendRedirect(response, target.href)
}

const answerCheckFailure = (
  context: AuthContext,
  response: ServerResponse,
  checked: Exclude<CheckedRequest, { kind: 'valid' }>
): void => {
  if (checked.kind === 'page-error') {
    sendErrorPage(response, HTTP_BAD_REQUEST, 'This request cannot go on', checked.message)
    return
  }
  sendToClient(response, checked.redirectUri, {
    error: checked.error,
    error_description: checked.description,
    state: checked.state,
    iss: context.settings.publicUrl
  })
}

const refuseAccount = (response: ServerResponse, account: Account | undefined): void => {
  if (!account) {
    sendErrorPage(response, HTTP_UNAUTHORIZED, 'Sign in first', 'Your Designo session has ended.')
    return
  }
  sendErrorPage(
    response,
    HTTP_FORBIDDEN,
    account.status === 'blocked' ? 'This account is blocked' : 'Waiting for approval',
    account.status === 'blocked'
      ? 'This Designo account is blocked, so no agent can be connected to it.'
      : 'An admin has to approve this Designo account before an agent can be connected to it.'
  )
}

const consentFormFields = (
  context: AuthContext,
  account: Account,
  fields: AuthorizationRequestFields
): Readonly<Record<string, string>> => ({
  client_id: fields.clientId,
  redirect_uri: fields.redirectUri,
  response_type: 'code',
  code_challenge: fields.codeChallenge,
  code_challenge_method: 'S256',
  ...(fields.state === undefined ? {} : { state: fields.state }),
  ...(fields.resource === undefined ? {} : { resource: fields.resource }),
  [CONSENT_TOKEN_FIELD]: createConsentToken(
    fields,
    account.id,
    context.clock(),
    context.settings.sessionSecret
  )
})

// Someone who is not signed in goes through Google and comes back to this very request. The
// return location is checked to be a plain path on this site, so the sign-in cannot be used to
// send anyone elsewhere.
const sendThroughSignIn = (request: IncomingMessage, response: ServerResponse): void => {
  const returnPath = safeReturnPath(request.url)
  if (!returnPath) {
    sendErrorPage(
      response,
      HTTP_BAD_REQUEST,
      'This request cannot go on',
      'The request is malformed.'
    )
    return
  }
  sendRedirect(response, `${AUTH_START_ROUTE}?return_to=${encodeURIComponent(returnPath)}`)
}

const showConsent = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const url = new URL(request.url ?? '', context.settings.publicUrl)
  const checked = await checkRequest(context, readRawParameters(url.searchParams))
  if (checked.kind !== 'valid') {
    answerCheckFailure(context, response, checked)
    return
  }
  const account = await accountFromRequest(context, request)
  if (!account) {
    sendThroughSignIn(request, response)
    return
  }
  if (account.status !== 'approved') {
    refuseAccount(response, account)
    return
  }
  sendPage(response, HTTP_OK, (nonce) =>
    renderConsentPage(
      {
        clientName: checked.client.clientName,
        redirectOrigin: new URL(checked.fields.redirectUri).origin,
        accountName: account.name,
        accountEmail: account.email,
        fields: consentFormFields(context, account, checked.fields)
      },
      nonce
    )
  )
}

const decide = (
  context: AuthContext,
  account: Account,
  fields: AuthorizationRequestFields,
  decision: string | null,
  response: ServerResponse
): void => {
  const common = { state: fields.state, iss: context.settings.publicUrl }
  // Only an explicit allow issues a code; anything else, a missing button included, is a no.
  if (decision !== 'allow') {
    sendToClient(response, fields.redirectUri, {
      error: 'access_denied',
      error_description: 'The person did not allow access',
      ...common
    })
    return
  }
  const code = context.authorizationCodes.issue({
    clientId: fields.clientId,
    redirectUri: fields.redirectUri,
    codeChallenge: fields.codeChallenge,
    accountId: account.id,
    resource: fields.resource
  })
  sendToClient(response, fields.redirectUri, { code, ...common })
}

// The session cookie is SameSite=Lax, which already keeps another site's POST from carrying it;
// the Origin check and a token tied to this account and this exact request are the second and
// third locks, so a bug in one does not turn the consent into a click anyone can forge.
const takeDecision = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const origin = request.headers.origin
  if (origin !== undefined && origin !== context.settings.publicUrl) {
    sendErrorPage(response, HTTP_FORBIDDEN, 'Request refused', 'Cross-site requests are refused.')
    return
  }
  const account = await accountFromRequest(context, request)
  if (account?.status !== 'approved') {
    refuseAccount(response, account)
    return
  }
  const form = await readFormOrRefuse(request, response)
  if (!form) return
  const checked = await checkRequest(context, readRawParameters(form))
  if (checked.kind !== 'valid') {
    answerCheckFailure(context, response, checked)
    return
  }
  const isGenuine = verifyConsentToken(
    form.get(CONSENT_TOKEN_FIELD) ?? '',
    checked.fields,
    account.id,
    context.clock(),
    context.settings.sessionSecret
  )
  if (!isGenuine) {
    sendErrorPage(
      response,
      HTTP_FORBIDDEN,
      'Request refused',
      'This page has expired or does not belong to this session. Start again from the program.'
    )
    return
  }
  decide(context, account, checked.fields, form.get('decision'), response)
}

/**
 * Answers `/authorize`. A GET shows the consent page to a signed-in, approved account, after
 * sending someone who is signed out through Google and back to the same request. A POST takes
 * the decision and sends the browser back to the client with a code, or an error.
 * @param context - The sign-in settings, the account and OAuth stores.
 * @param request - The incoming request.
 * @param response - Where the answer goes.
 * @returns Resolves once the answer is sent.
 */
export const handleAuthorize = async (
  context: AuthContext,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  if (request.method === 'GET') await showConsent(context, request, response)
  else if (request.method === 'POST') await takeDecision(context, request, response)
  else sendError(response, HTTP_METHOD_NOT_ALLOWED, 'Method not allowed')
}
