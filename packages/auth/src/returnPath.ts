const MAX_RETURN_PATH_LENGTH = 2048
// Any origin will do: the path is only parsed against it to see whether it stays on that origin.
const PLACEHOLDER_ORIGIN = 'https://placeholder.invalid'

/**
 * Checks where to send someone after sign-in. Only a path on this same site is accepted, so a
 * crafted link can never turn the sign-in into a redirect to another site. The value is parsed
 * and rebuilt rather than trusted as written: tabs and dot segments can turn a path that looks
 * fine into `//other.site`.
 * @param value - The requested location, from a query string or a signed cookie.
 * @returns The path and query to redirect to, or undefined when it is not a plain same-site path.
 */
export const safeReturnPath = (value: string | null | undefined): string | undefined => {
  if (!value || value.length > MAX_RETURN_PATH_LENGTH) return undefined
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  if (/[\s\\\p{Cc}]/u.test(value)) return undefined
  const parsed = new URL(value, PLACEHOLDER_ORIGIN)
  const rebuilt = `${parsed.pathname}${parsed.search}`
  return parsed.origin === PLACEHOLDER_ORIGIN && !rebuilt.startsWith('//') ? rebuilt : undefined
}
