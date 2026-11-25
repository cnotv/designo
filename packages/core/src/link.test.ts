import { describe, expect, it } from 'vitest'
import { isValidLink } from './link.ts'

describe('isValidLink', () => {
  it.each([
    'https://example.com',
    'https://github.com/cnotv/designo?tab=x#y',
    'mailto:a@b.de',
    'tel:+49 170 1234567'
  ])('accepts %s', (link) => expect(isValidLink(link)).toBe(true))

  it.each([
    '',
    'http://example.com',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://',
    'https://a b.com',
    'mailto:nobody',
    'tel:abc',
    'example.com'
  ])('rejects %s', (link) => expect(isValidLink(link)).toBe(false))
})
