import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const PART_SEPARATOR = '.'
const PART_COUNT = 2

const envelopeSchema = z.object({ purpose: z.string(), payload: z.unknown() })

const computeSignature = (body: string, secret: string): Buffer =>
  createHmac('sha256', secret).update(body).digest()

/**
 * Signs a value so it can sit in a cookie and be trusted when it comes back. The purpose is
 * signed with it, so a value made for one use cannot be replayed as another.
 * @param purpose - What the value is for, such as `session`.
 * @param payload - Any JSON-serialisable value.
 * @param secret - The signing key.
 * @returns `<body>.<signature>`, both base64url.
 */
export const signValue = (purpose: string, payload: unknown, secret: string): string => {
  const body = Buffer.from(JSON.stringify({ purpose, payload })).toString('base64url')
  return `${body}${PART_SEPARATOR}${computeSignature(body, secret).toString('base64url')}`
}

const hasValidSignature = (body: string, signature: string, secret: string): boolean => {
  const expected = computeSignature(body, secret)
  const given = Buffer.from(signature, 'base64url')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Checks a signed value in constant time and returns what it carries. The caller validates the
 * payload's shape; this only proves this server signed it, for this purpose.
 * @param purpose - What the value must have been made for.
 * @param value - The signed string from the cookie.
 * @param secret - The signing key.
 * @returns The payload, or undefined for anything forged, tampered, malformed or for another use.
 */
export const verifySignedValue = (
  purpose: string,
  value: string,
  secret: string
): unknown | undefined => {
  const parts = value.split(PART_SEPARATOR)
  const [body, signature] = parts
  if (parts.length !== PART_COUNT || !body || !signature) return undefined
  if (!hasValidSignature(body, signature, secret)) return undefined
  const envelope = envelopeSchema.safeParse(
    JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  )
  return envelope.success && envelope.data.purpose === purpose ? envelope.data.payload : undefined
}
