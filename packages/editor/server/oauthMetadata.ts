import type {
  OAuthMetadata,
  OAuthProtectedResourceMetadata
} from '@modelcontextprotocol/sdk/shared/auth.js'
import type { AuthSettings } from '@designo/auth'

export const MCP_ROUTE = '/mcp'
export const REGISTER_ROUTE = '/register'
export const AUTHORIZE_ROUTE = '/authorize'
export const TOKEN_ROUTE = '/token'
export const REVOKE_ROUTE = '/revoke'
export const PROTECTED_RESOURCE_METADATA_ROUTE = '/.well-known/oauth-protected-resource'
export const AUTHORIZATION_SERVER_METADATA_ROUTE = '/.well-known/oauth-authorization-server'

export const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const
export const SUPPORTED_RESPONSE_TYPES = ['code'] as const

// Everything here is built from the configured public URL, never from the Host header a request
// claims: behind a reverse proxy the Host is not what clients must be told, and a forged one
// would otherwise decide where tokens are sent.

/**
 * The address agents connect to, and the `resource` their tokens are for.
 * @param settings - The sign-in settings.
 * @returns The `/mcp` URL.
 */
export const mcpResourceUrl = (settings: AuthSettings): string =>
  `${settings.publicUrl}${MCP_ROUTE}`

/**
 * Where an agent that was turned away finds how to sign in (RFC 9728). The path of the resource
 * comes after the well-known part, which is where clients look first.
 * @param settings - The sign-in settings.
 * @returns The metadata URL.
 */
export const protectedResourceMetadataUrl = (settings: AuthSettings): string =>
  `${settings.publicUrl}${PROTECTED_RESOURCE_METADATA_ROUTE}${MCP_ROUTE}`

/**
 * Describes the protected resource (RFC 9728).
 * @param settings - The sign-in settings.
 * @returns The document to serve.
 */
export const protectedResourceMetadata = (
  settings: AuthSettings
): OAuthProtectedResourceMetadata => ({
  resource: mcpResourceUrl(settings),
  authorization_servers: [settings.publicUrl],
  bearer_methods_supported: ['header'],
  resource_name: 'Designo'
})

/**
 * Describes the authorization server (RFC 8414). Public clients only, and PKCE with S256 is the
 * only method, because a code that can be redeemed without it can be stolen on a loopback port.
 * @param settings - The sign-in settings.
 * @returns The document to serve.
 */
export const authorizationServerMetadata = (
  settings: AuthSettings
): OAuthMetadata & { authorization_response_iss_parameter_supported: boolean } => ({
  issuer: settings.publicUrl,
  authorization_endpoint: `${settings.publicUrl}${AUTHORIZE_ROUTE}`,
  token_endpoint: `${settings.publicUrl}${TOKEN_ROUTE}`,
  registration_endpoint: `${settings.publicUrl}${REGISTER_ROUTE}`,
  revocation_endpoint: `${settings.publicUrl}${REVOKE_ROUTE}`,
  response_types_supported: [...SUPPORTED_RESPONSE_TYPES],
  grant_types_supported: [...SUPPORTED_GRANT_TYPES],
  token_endpoint_auth_methods_supported: ['none'],
  revocation_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
  authorization_response_iss_parameter_supported: true
})
