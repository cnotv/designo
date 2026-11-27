import { describe, expect, it } from 'vitest'
import { applyOperations, createDocument } from '@designo/core'
import { exportDocumentToPdf } from '@designo/exporter/pdf'
import { createTextEngine, loadTextLayout, toTextLayoutRequest } from '@designo/text'
import {
  FIXTURE_FONT_CATALOG,
  createFixtureFontLibrary,
  readFixtureFontBytes
} from '@designo/text/fixtures'
import { extractPdfFacts } from './extractPdfFacts.ts'

const library = createFixtureFontLibrary()
const engine = createTextEngine({ library })
const fontBytes = new Map(
  await Promise.all(
    FIXTURE_FONT_CATALOG.fonts.map(
      async (font) => [font.id, await readFixtureFontBytes(font.url)] as const
    )
  )
)

const exportSample = async (): Promise<Uint8Array> => {
  const result = applyOperations(createDocument('f', 'Resume', 'page'), [
    {
      kind: 'create',
      id: 'mail',
      type: 'text',
      parentId: 'page',
      properties: {
        x: 40,
        y: 40,
        width: 300,
        height: 24,
        text: 'jane@example.com',
        link: 'mailto:jane@example.com'
      }
    }
  ])
  if (!result.ok) throw new Error(result.error)
  const document = {
    ...result.document,
    metadata: { language: 'en' }
  }
  const texts = Object.values(document.nodes).filter((node) => node.type === 'text')
  const layouts = new Map(
    await Promise.all(
      texts.map(
        async (node) =>
          [node.id, await loadTextLayout({ library, engine }, toTextLayoutRequest(node))] as const
      )
    )
  )
  return exportDocumentToPdf(document, {
    getTextLayout: (node) => layouts.get(node.id),
    getFontBytes: (fontId) => fontBytes.get(fontId)
  })
}

describe('extractPdfFacts', () => {
  it('reads text, fonts and a link from an exported PDF', async () => {
    const facts = await extractPdfFacts(await exportSample())
    expect(facts.pages[0]?.items.map((item) => item.text).join('')).toContain('jane@example.com')
    expect(facts.fonts.length).toBeGreaterThan(0)
    expect(facts.fonts.every((font) => font.embedded && font.hasUnicodeMap)).toBe(true)
    expect(facts.links).toEqual([
      expect.objectContaining({
        url: 'mailto:jane@example.com',
        visibleText: expect.stringContaining('jane')
      })
    ])
    expect(facts.title).toBe('Resume')
    expect(facts.language).toBe('en')
  })
})
