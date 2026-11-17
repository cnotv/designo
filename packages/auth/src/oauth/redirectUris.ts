export const MAX_REDIRECT_URIS = 5
export const MAX_REDIRECT_URI_LENGTH = 512

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

const textProblem = (uri: string): string | undefined => {
  if (uri.length === 0 || uri.length > MAX_REDIRECT_URI_LENGTH) {
    return `A redirect URI must be 1 to ${MAX_REDIRECT_URI_LENGTH} characters`
  }
  if (/[\s\p{Cc}]/u.test(uri))
    return 'A redirect URI cannot contain whitespace or control characters'
  if (uri.includes('*')) return 'A redirect URI cannot contain a wildcard'
  return uri.includes('#') ? 'A redirect URI cannot contain a fragment' : undefined
}

const locationProblem = (url: URL): string | undefined => {
  if (url.username !== '' || url.password !== '') return 'A redirect URI cannot carry credentials'
  const isHttps = url.protocol === 'https:'
  const isLoopback = url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)
  return isHttps || isLoopback
    ? undefined
    : 'A redirect URI must be https, or http on localhost, 127.0.0.1 or [::1]'
}

/**
 * Says what is wrong with a redirect URI a client wants to register. Codes are sent there, so
 * only places a code cannot be intercepted are allowed: https, or http on the machine itself,
 * which is where a command-line agent listens. Nothing is a pattern: a match is an exact string.
 * @param uri - One entry of `redirect_uris`.
 * @returns The problem, or undefined when the URI is acceptable.
 */
export const redirectUriProblem = (uri: string): string | undefined => {
  const problem = textProblem(uri)
  if (problem) return problem
  return URL.canParse(uri)
    ? locationProblem(new URL(uri))
    : 'A redirect URI must be an absolute URL'
}

/**
 * Says what is wrong with the redirect URIs of a registration, as a set.
 * @param uris - The `redirect_uris` array.
 * @returns The first problem, or undefined when every URI is acceptable.
 */
export const redirectUrisProblem = (uris: readonly string[]): string | undefined => {
  if (uris.length === 0) return 'At least one redirect URI is needed'
  if (uris.length > MAX_REDIRECT_URIS) return `At most ${MAX_REDIRECT_URIS} redirect URIs`
  return uris.map(redirectUriProblem).find((problem) => problem !== undefined)
}
