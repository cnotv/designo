import { z } from 'zod'
import { accountIdSchema } from '../schemas.ts'

const MAX_ID_LENGTH = 64
const MAX_NAME_LENGTH = 200
const MAX_URI_LENGTH = 2048
const MAX_STORED_REDIRECT_URIS = 20
const MAX_STORED_HASHES = 50

const hashSchema = z.string().regex(/^[\da-f]{64}$/)

export const oauthClientSchema = z.object({
  clientId: z.string().min(1).max(MAX_ID_LENGTH),
  clientName: z.string().max(MAX_NAME_LENGTH),
  redirectUris: z.array(z.string().max(MAX_URI_LENGTH)).min(1).max(MAX_STORED_REDIRECT_URIS),
  createdAt: z.string()
})

export const oauthGrantSchema = z.object({
  id: z.string().min(1).max(MAX_ID_LENGTH),
  clientId: z.string().min(1).max(MAX_ID_LENGTH),
  accountId: accountIdSchema,
  createdAt: z.string(),
  accessTokenHash: hashSchema,
  accessTokenExpiresAt: z.number(),
  refreshTokenHash: hashSchema,
  refreshTokenExpiresAt: z.number(),
  rotatedRefreshTokenHashes: z.array(hashSchema).max(MAX_STORED_HASHES)
})

export const oauthFileSchema = z.object({
  formatVersion: z.literal(1),
  clients: z.array(oauthClientSchema),
  grants: z.array(oauthGrantSchema)
})
