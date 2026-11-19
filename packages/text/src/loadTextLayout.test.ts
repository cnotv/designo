import { describe, expect, it } from 'vitest'
import { createFixtureFontLibrary } from './fixtures/fontFiles.ts'
import { loadTextLayout } from './loadTextLayout.ts'
import { createTextEngine } from './textEngine.ts'

const library = createFixtureFontLibrary()
const runtime = { library, engine: createTextEngine({ library }) }
const request = {
  text: 'one two three',
  fontFamily: 'Inter',
  fontSize: 20,
  lineHeight: 1.2,
  alignment: 'left' as const,
  wrapWidth: undefined
}

describe('loadTextLayout', () => {
  it('waits for the fonts, then lays the text out', async () => {
    const layout = await loadTextLayout(runtime, request)
    expect(layout?.lines).toHaveLength(1)
    expect(layout?.width).toBeGreaterThan(0)
  })

  it('wraps a fixed-width text into more lines, with the text each line holds', async () => {
    const layout = await loadTextLayout(runtime, { ...request, wrapWidth: 60 })
    expect(layout?.lines.length).toBeGreaterThan(1)
    expect(layout?.lines[0]?.start).toBe(0)
  })

  it('answers undefined for a character none of the fonts draws', async () => {
    expect(await loadTextLayout(runtime, { ...request, text: '日本' })).toBeUndefined()
  })
})
