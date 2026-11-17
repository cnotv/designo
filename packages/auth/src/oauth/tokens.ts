import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 32

/**
 * Makes an opaque token from 256 random bits.
 * @returns A base64url string with nothing in it to read.
 */
export const createOpaqueToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url')

/**
 * Hashes a token for storage and lookup. A token is already 256 random bits, so a plain SHA-256
 * is enough: there is nothing to guess and nothing to stretch.
 * @param token - The token in the clear.
 * @returns Lower-case hex.
 */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')
