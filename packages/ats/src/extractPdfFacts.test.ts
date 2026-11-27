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

const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (character) => character.charCodeAt(0)
)

const exportSample = async (withPicture = false): Promise<Uint8Array> => {
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
    },
    ...(withPicture
      ? [
          {
            kind: 'create' as const,
            id: 'photo',
            type: 'image' as const,
            parentId: 'page',
            properties: { x: 100, y: 200, width: 80, height: 60, imageAsset: 'photo.png' }
          }
        ]
      : [])
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
    getFontBytes: (fontId) => fontBytes.get(fontId),
    getImageBytes: () => ONE_PIXEL_PNG
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

  it('finds where a picture lands, measured from the top of the page', async () => {
    const facts = await extractPdfFacts(await exportSample(true))
    // A page with no numbered frame starts at its content, which here begins at (40, 40).
    const [image] = facts.pages[0]?.images ?? []
    expect(image).toMatchObject({ x: 60, y: 160, width: 80, height: 60 })
    expect(facts.pages[0]?.hasInvisibleText).toBe(false)
  })
})
