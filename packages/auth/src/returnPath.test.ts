import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './returnPath.ts'

describe('safeReturnPath', () => {
  it.each([
    ['/', '/'],
    ['/authorize?client_id=abc&state=x%20y', '/authorize?client_id=abc&state=x%20y'],
    ['/editor/file-1', '/editor/file-1'],
    ['/a/../b', '/b']
  ])('keeps the same-site path %s', (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected)
  })

  it('drops a fragment, which the server never sees anyway', () => {
    expect(safeReturnPath('/authorize?a=1#frag')).toBe('/authorize?a=1')
  })

  it.each([
    ['another site', 'https://evil.example.com/'],
    ['a protocol-relative URL', '//evil.example.com/'],
    ['a backslash that browsers read as a slash', '/\\evil.example.com'],
    ['a backslash anywhere', '/a\\b'],
    ['a tab that a URL parser deletes, leaving a protocol-relative URL', '/\t/evil.example.com'],
    ['a line break', '/a\nb'],
    ['a dot segment that collapses into a protocol-relative URL', '/.//evil.example.com'],
    ['a path with no leading slash', 'authorize'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an empty string', ''],
    ['a path that is far too long', `/${'a'.repeat(3000)}`]
  ])('refuses %s', (_label, value) => {
    expect(safeReturnPath(value)).toBeUndefined()
  })

  it('refuses something that is not text', () => {
    expect(safeReturnPath(undefined)).toBeUndefined()
    expect(safeReturnPath(null)).toBeUndefined()
  })
})
