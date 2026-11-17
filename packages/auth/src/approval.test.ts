import { describe, expect, it } from 'vitest'
import { decideInitialStatus, decideStatusOnSignIn, isAdminAccount } from './approval.ts'
import type { ApprovalRules, VerifiedIdentity } from './types.ts'

const rules: ApprovalRules = {
  adminEmails: ['admin@example.com'],
  autoApproveEmails: ['friend@example.com'],
  autoApproveDomains: ['team.example.com']
}

const identity = (email: string, emailVerified = true): VerifiedIdentity => ({
  subject: 'sub-1',
  email,
  emailVerified,
  name: 'Someone'
})

describe('decideInitialStatus', () => {
  it('approves a verified admin', () => {
    expect(decideInitialStatus(identity('admin@example.com'), rules)).toBe('approved')
  })

  it('approves a verified listed address and a verified address on a listed domain', () => {
    expect(decideInitialStatus(identity('friend@example.com'), rules)).toBe('approved')
    expect(decideInitialStatus(identity('anyone@team.example.com'), rules)).toBe('approved')
  })

  it('ignores letter case in the address', () => {
    expect(decideInitialStatus(identity('Admin@Example.COM'), rules)).toBe('approved')
  })

  it('leaves everyone else pending', () => {
    expect(decideInitialStatus(identity('stranger@example.com'), rules)).toBe('pending')
  })

  it('does not treat a subdomain or a lookalike as a listed domain', () => {
    expect(decideInitialStatus(identity('a@sub.team.example.com'), rules)).toBe('pending')
    expect(decideInitialStatus(identity('a@evilteam.example.com'), rules)).toBe('pending')
    expect(decideInitialStatus(identity('team.example.com@evil.example'), rules)).toBe('pending')
  })

  it.each(['admin@example.com', 'friend@example.com', 'anyone@team.example.com'])(
    'keeps %s pending when Google has not verified it',
    (email) => {
      expect(decideInitialStatus(identity(email, false), rules)).toBe('pending')
    }
  )
})

describe('isAdminAccount', () => {
  it('needs a listed and verified address', () => {
    expect(
      isAdminAccount({ email: 'admin@example.com', emailVerified: true }, ['admin@example.com'])
    ).toBe(true)
    expect(
      isAdminAccount({ email: 'admin@example.com', emailVerified: false }, ['admin@example.com'])
    ).toBe(false)
    expect(
      isAdminAccount({ email: 'other@example.com', emailVerified: true }, ['admin@example.com'])
    ).toBe(false)
  })
})

describe('decideStatusOnSignIn', () => {
  const adminEmails = ['admin@example.com']

  it.each(['pending', 'blocked'] as const)(
    'approves a verified admin whose account is %s',
    (current) => {
      expect(decideStatusOnSignIn(current, identity('admin@example.com'), adminEmails)).toBe(
        'approved'
      )
    }
  )

  it('keeps the status of anyone who is not a verified admin', () => {
    expect(decideStatusOnSignIn('pending', identity('someone@example.com'), adminEmails)).toBe(
      'pending'
    )
    expect(decideStatusOnSignIn('blocked', identity('someone@example.com'), adminEmails)).toBe(
      'blocked'
    )
    expect(decideStatusOnSignIn('approved', identity('someone@example.com'), adminEmails)).toBe(
      'approved'
    )
  })

  it('does not approve an admin address Google has not verified', () => {
    expect(decideStatusOnSignIn('pending', identity('admin@example.com', false), adminEmails)).toBe(
      'pending'
    )
  })
})
