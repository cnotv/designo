import { describe, expect, it } from 'vitest'
import {
  accountStatusRoute,
  countPendingAccounts,
  formatJoinedDate,
  isAdminRefusal,
  readAccountList,
  readChangedAccount,
  sortAccountsForReview,
  statusAfterAction,
  statusBadgeVariant,
  actionsForAccount
} from './accountAdministration.ts'
import type { AccountSummary } from './types.ts'

const summary = (overrides: Partial<AccountSummary> = {}): AccountSummary => ({
  id: 'abc-123',
  email: 'sam@example.com',
  name: 'Sam',
  status: 'pending',
  createdAt: '2026-03-04T10:20:30.000Z',
  isAdmin: false,
  ...overrides
})

describe('accountStatusRoute', () => {
  it('names the status route of one account', () => {
    expect(accountStatusRoute('abc-123')).toBe('/api/admin/accounts/abc-123/status')
  })

  it('encodes an id so it can never add a path segment', () => {
    expect(accountStatusRoute('a/b')).toBe('/api/admin/accounts/a%2Fb/status')
  })
})

describe('readAccountList', () => {
  it('reads the accounts of an answer', () => {
    expect(readAccountList(200, { accounts: [summary()] })).toEqual([summary()])
  })

  it.each([
    ['a refusal', 404, { error: 'Not found' }],
    ['a status other than 200', 500, { accounts: [] }],
    ['a body of the wrong shape', 200, { accounts: 'nope' }],
    ['an unknown status', 200, { accounts: [{ ...summary(), status: 'root' }] }],
    ['no body', 200, undefined]
  ])('reads %s as no list', (_label, status, body) => {
    expect(readAccountList(status, body)).toBeUndefined()
  })
})

describe('readChangedAccount', () => {
  it('reads the account the server answers with', () => {
    expect(readChangedAccount(200, summary({ status: 'approved' }))).toEqual(
      summary({ status: 'approved' })
    )
  })

  it('reads anything else as no account', () => {
    expect(readChangedAccount(409, { error: 'no' })).toBeUndefined()
    expect(readChangedAccount(200, { id: 1 })).toBeUndefined()
  })
})

describe('isAdminRefusal', () => {
  it.each([401, 403, 404])('counts %i as losing the right to manage accounts', (status) => {
    expect(isAdminRefusal(status)).toBe(true)
  })

  it.each([200, 400, 409, 500])('does not count %i', (status) => {
    expect(isAdminRefusal(status)).toBe(false)
  })
})

describe('actionsForAccount', () => {
  const labelsOf = (account: AccountSummary): string[] =>
    actionsForAccount(account).map((action) => action.label)

  it('offers Approve and Block for a pending account', () => {
    expect(labelsOf(summary({ status: 'pending' }))).toEqual(['Approve', 'Block'])
  })

  it('offers only Block for an approved account', () => {
    expect(labelsOf(summary({ status: 'approved' }))).toEqual(['Block'])
  })

  it('offers only Unblock for a blocked account', () => {
    expect(labelsOf(summary({ status: 'blocked' }))).toEqual(['Unblock'])
  })

  it('never offers Block for an admin, which the server refuses', () => {
    expect(labelsOf(summary({ status: 'approved', isAdmin: true }))).toEqual([])
    expect(labelsOf(summary({ status: 'pending', isAdmin: true }))).toEqual(['Approve'])
  })

  it('marks Block as the destructive action', () => {
    const [approve, block] = actionsForAccount(summary({ status: 'pending' }))
    expect(approve).toMatchObject({ action: 'approve', variant: 'outline' })
    expect(block).toMatchObject({ action: 'block', variant: 'destructive' })
  })
})

describe('statusAfterAction', () => {
  it('maps approve and unblock to approved, block to blocked', () => {
    expect(statusAfterAction('approve')).toBe('approved')
    expect(statusAfterAction('unblock')).toBe('approved')
    expect(statusAfterAction('block')).toBe('blocked')
  })
})

describe('statusBadgeVariant', () => {
  it('tells the three statuses apart', () => {
    expect(statusBadgeVariant('approved')).toBe('default')
    expect(statusBadgeVariant('pending')).toBe('secondary')
    expect(statusBadgeVariant('blocked')).toBe('destructive')
  })
})

describe('sortAccountsForReview', () => {
  it('puts the accounts waiting for approval first, then oldest first', () => {
    const accounts = [
      summary({ id: 'a', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z' }),
      summary({ id: 'b', status: 'pending', createdAt: '2026-02-02T00:00:00.000Z' }),
      summary({ id: 'c', status: 'blocked', createdAt: '2026-01-02T00:00:00.000Z' }),
      summary({ id: 'd', status: 'pending', createdAt: '2026-02-01T00:00:00.000Z' })
    ]
    expect(sortAccountsForReview(accounts).map((account) => account.id)).toEqual([
      'd',
      'b',
      'a',
      'c'
    ])
  })

  it('does not change the list it is given', () => {
    const accounts = [summary({ id: 'a', status: 'approved' }), summary({ id: 'b' })]
    sortAccountsForReview(accounts)
    expect(accounts.map((account) => account.id)).toEqual(['a', 'b'])
  })
})

describe('countPendingAccounts', () => {
  it('counts the accounts waiting for approval', () => {
    expect(
      countPendingAccounts([
        summary({ status: 'pending' }),
        summary({ status: 'approved' }),
        summary({ status: 'pending' })
      ])
    ).toBe(2)
    expect(countPendingAccounts([])).toBe(0)
  })
})

describe('formatJoinedDate', () => {
  it('shows the day, in UTC so every admin reads the same date', () => {
    expect(formatJoinedDate('2026-03-04T23:59:59.000Z')).toBe('2026-03-04')
  })

  it('shows a dash for a date that cannot be read', () => {
    expect(formatJoinedDate('not a date')).toBe('-')
  })
})
