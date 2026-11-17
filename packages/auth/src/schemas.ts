import { z } from 'zod'

// The id becomes a folder name, so it is validated wherever it comes from, disk and cookie alike.
export const accountIdSchema = z.string().regex(/^[\w-]{1,64}$/)

export const accountSchema = z.object({
  id: accountIdSchema,
  subject: z.string().min(1),
  email: z.string(),
  emailVerified: z.boolean(),
  name: z.string(),
  status: z.enum(['pending', 'approved', 'blocked']),
  createdAt: z.string()
})

export const accountsFileSchema = z.object({
  formatVersion: z.literal(1),
  accounts: z.array(accountSchema)
})

export const sessionClaimsSchema = z.object({
  accountId: accountIdSchema,
  expiresAt: z.number()
})

export const loginAttemptSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
  expiresAt: z.number()
})
