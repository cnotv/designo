import { describe, expect, it } from 'vitest'
import { canHaveLink, readLinkInput } from './links.ts'

describe('readLinkInput', () => {
  it('trims an address it accepts', () => {
    expect(readLinkInput('  https://example.com  ')).toBe('https://example.com')
    expect(readLinkInput('mailto:me@example.com')).toBe('mailto:me@example.com')
  })

  it('clears the link when the field is emptied', () => {
    expect(readLinkInput('   ')).toBeNull()
  })

  it('refuses what is not a link the PDF may carry', () => {
    expect(readLinkInput('javascript:alert(1)')).toBeUndefined()
    expect(readLinkInput('example.com')).toBeUndefined()
  })
})

describe('canHaveLink', () => {
  it('is true for text, rectangles and frames only', () => {
    expect(['text', 'rectangle', 'frame'].every((type) => canHaveLink(type as 'text'))).toBe(true)
    expect(['ellipse', 'image', 'group', 'page'].some((type) => canHaveLink(type as 'page'))).toBe(
      false
    )
  })
})
