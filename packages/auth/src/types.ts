/** Milliseconds since the epoch. Injected so tests control time. */
export type Clock = () => number

export type AccountStatus = 'pending' | 'approved' | 'blocked'

export interface Account {
  /** Random, made at creation. Names the account's folder; never Google's `sub` or the email. */
  id: string
  /** Google's `sub`: the stable key a sign-in is matched on. */
  subject: string
  /** Lower case. */
  email: string
  /** Whether Google vouched for the email the last time this account signed in. */
  emailVerified: boolean
  name: string
  status: AccountStatus
  /** ISO 8601. */
  createdAt: string
}

/** What the identity provider says about the person who just signed in. */
export interface VerifiedIdentity {
  subject: string
  email: string
  emailVerified: boolean
  name: string
}

export interface AuthSettings {
  googleClientId: string
  googleClientSecret: string
  /** Origin only, without a trailing slash. */
  publicUrl: string
  /** False only for http://localhost, so development works without TLS. */
  secureCookies: boolean
  sessionSecret: string
  /** Lower case. */
  adminEmails: readonly string[]
  /** Lower case. */
  autoApproveEmails: readonly string[]
  /** Lower case, without a leading `@`. */
  autoApproveDomains: readonly string[]
}

/** The rules that decide a new account's first status. */
export type ApprovalRules = Pick<
  AuthSettings,
  'adminEmails' | 'autoApproveEmails' | 'autoApproveDomains'
>

/** The one-off values a sign-in attempt needs back when Google redirects the person home. */
export interface AuthorizationChecks {
  state: string
  nonce: string
  codeVerifier: string
}

export interface AuthorizationRequest extends AuthorizationChecks {
  /** Where to send the browser. */
  url: string
}

/** Where sign-in comes from. Google is the only implementation; tests inject a fake. */
export interface IdentityProvider {
  /**
   * Builds the redirect to the provider with a fresh state, nonce and PKCE verifier.
   * @returns The URL and the values to check when the person comes back.
   */
  createAuthorizationRequest: () => Promise<AuthorizationRequest>
  /**
   * Completes a sign-in: checks the callback against what was sent and returns who signed in.
   * @param callbackUrl - The full URL the provider redirected to, query included.
   * @param checks - The values `createAuthorizationRequest` returned for this attempt.
   * @returns The verified identity; rejects if anything does not check out.
   */
  exchangeCallback: (callbackUrl: URL, checks: AuthorizationChecks) => Promise<VerifiedIdentity>
}

export interface GoogleIdentityProviderOptions {
  clientId: string
  clientSecret: string
  /** `<public url>/auth/google/callback`, as registered with Google. */
  redirectUri: string
  /** Only tests set this: a stand-in for Google that speaks OpenID Connect. */
  issuer?: string
  /** Only tests set this: lets the stand-in issuer be plain http. */
  allowInsecureIssuer?: boolean
}

export interface SessionClaims {
  accountId: string
  /** Epoch milliseconds. */
  expiresAt: number
}

export interface LoginAttempt extends AuthorizationChecks {
  /** Epoch milliseconds. */
  expiresAt: number
}

export interface CookieOptions {
  maxAgeSeconds: number
  secure: boolean
  path: string
}

export interface AccountStore {
  list: () => Promise<readonly Account[]>
  findById: (accountId: string) => Promise<Account | undefined>
  /** More than one account can share an email, so this returns every match. */
  findByEmail: (email: string) => Promise<readonly Account[]>
  /**
   * Records a sign-in: creates the account on the first one, refreshes email and name after.
   * @param identity - The verified identity from the provider.
   * @param rules - Decide the first status; a later sign-in never changes it.
   * @param now - The current time, for `createdAt`.
   * @returns The account as stored.
   */
  signIn: (identity: VerifiedIdentity, rules: ApprovalRules, now: number) => Promise<Account>
}
