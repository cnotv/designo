import { describe, expect, it } from 'vitest'
import { createDocument } from '@designo/core'
import { nodePatchSchema, operationBatchSchema, storedDocumentSchema } from './schemas.ts'

describe('text properties in a patch', () => {
  it('accepts each alignment, a line height and the wrap switch', () => {
    ;['left', 'center', 'right', 'justify'].forEach((textAlign) => {
      expect(nodePatchSchema.safeParse({ textAlign }).success).toBe(true)
    })
    expect(nodePatchSchema.safeParse({ lineHeight: 1.6, textWrap: true }).success).toBe(true)
  })

  it('rejects an alignment it does not know', () => {
    expect(nodePatchSchema.safeParse({ textAlign: 'distribute' }).success).toBe(false)
  })

  it('accepts a weight, a style and a letter spacing, within their ranges', () => {
    expect(
      nodePatchSchema.safeParse({ fontWeight: 700, fontStyle: 'italic', letterSpacing: -0.05 })
        .success
    ).toBe(true)
  })

  it.each([
    { fontWeight: 50 },
    { fontWeight: 1000 },
    { fontStyle: 'oblique' },
    { letterSpacing: 3 }
  ])('rejects %j', (patch) => {
    expect(nodePatchSchema.safeParse(patch).success).toBe(false)
  })

  it.each([0, -1, 0.1, 11, Number.NaN])('rejects a line height of %s', (lineHeight) => {
    expect(nodePatchSchema.safeParse({ lineHeight }).success).toBe(false)
  })

  it('rejects a wrap switch that is not a boolean', () => {
    expect(nodePatchSchema.safeParse({ textWrap: 'yes' }).success).toBe(false)
  })

  it('reaches create and update operations, which are the only way to change a document', () => {
    const result = operationBatchSchema.safeParse([
      {
        kind: 'create',
        type: 'text',
        parentId: 'page',
        properties: { textAlign: 'center', lineHeight: 1.5, textWrap: true }
      },
      { kind: 'update', id: 'a', patch: { textAlign: 'right' } }
    ])
    expect(result.success).toBe(true)
  })
})

describe('link in a patch', () => {
  it.each(['https://example.com/cv', 'mailto:me@example.com', 'tel:+49 170 1234567', null])(
    'accepts %s',
    (link) => {
      expect(nodePatchSchema.safeParse({ link }).success).toBe(true)
    }
  )

  it.each(['javascript:alert(1)', 'http://example.com', 'file:///etc/passwd', 'example.com', ''])(
    'rejects %s',
    (link) => {
      expect(nodePatchSchema.safeParse({ link }).success).toBe(false)
    }
  )
})

describe('text spans and lists in a patch', () => {
  it('accepts spans with their own weight, style and colour, and a list style', () => {
    expect(
      nodePatchSchema.safeParse({
        spans: [{ start: 0, end: 4, fontWeight: 700, fontStyle: 'italic', fill: '#ff0000' }],
        listStyle: 'number',
        listIndent: 2
      }).success
    ).toBe(true)
  })

  it.each([
    { spans: [{ start: 0, end: 4, fontWeight: 50 }] },
    { spans: [{ start: -1, end: 4 }] },
    { spans: [{ start: 0, end: 4, fill: 'red' }] },
    { spans: [{ start: 0, end: 4, colour: '#ff0000' }] },
    { listStyle: 'roman' },
    { listIndent: -1 }
  ])('rejects %j', (patch) => {
    expect(nodePatchSchema.safeParse(patch).success).toBe(false)
  })

  it('reads a stored node from before spans existed as one with none and no list', () => {
    const document = createDocument('file-a', 'Doc', 'page-a')
    const page = Object.fromEntries(
      Object.entries(document.nodes['page-a'] ?? {}).filter(
        ([key]) => !['spans', 'listStyle', 'listIndent'].includes(key)
      )
    )
    const parsed = storedDocumentSchema.parse({ ...document, nodes: { 'page-a': page } })
    expect(parsed.nodes['page-a']).toMatchObject({ spans: [], listStyle: 'none', listIndent: 1.5 })
  })
})

describe('renaming a file', () => {
  it('takes a name and refuses a blank one', () => {
    const accepts = (name: string): boolean =>
      operationBatchSchema.safeParse([{ kind: 'renameDocument', name }]).success
    expect([accepts('Poster'), accepts('   '), accepts('')]).toEqual([true, false, false])
  })
})

describe('PDF metadata and tags', () => {
  it('takes a title, author and subject operation and refuses other fields', () => {
    expect(
      operationBatchSchema.safeParse([
        { kind: 'updateMetadata', patch: { title: 'CV', author: 'Jane', subject: '' } }
      ]).success
    ).toBe(true)
    expect(
      operationBatchSchema.safeParse([{ kind: 'updateMetadata', patch: { keywords: 'x' } }]).success
    ).toBe(false)
  })

  it('takes a language tag, or an empty string to clear it, and nothing else', () => {
    const accepts = (language: string): boolean =>
      operationBatchSchema.safeParse([{ kind: 'updateMetadata', patch: { language } }]).success
    expect([accepts('en'), accepts('de-DE'), accepts('')]).toEqual([true, true, true])
    expect([accepts('English'), accepts('e'), accepts('en_US')]).toEqual([false, false, false])
  })

  it('takes a heading level, paragraph or list item as pdfTag, and nothing else', () => {
    expect(nodePatchSchema.safeParse({ pdfTag: 'h3' }).success).toBe(true)
    expect(nodePatchSchema.safeParse({ pdfTag: null }).success).toBe(true)
    expect(nodePatchSchema.safeParse({ pdfTag: 'h7' }).success).toBe(false)
  })
})

describe('variables and text styles', () => {
  const style = {
    id: 'body',
    name: 'Body',
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: 400,
    fontStyle: 'normal',
    lineHeight: 1.4,
    letterSpacing: 0
  }

  it('takes operations that set and delete a variable and a text style', () => {
    expect(
      operationBatchSchema.safeParse([
        {
          kind: 'setVariable',
          variable: { id: 'ink', name: 'Ink', kind: 'color', value: '#111111' }
        },
        { kind: 'setVariable', variable: { id: 'gap', name: 'Gap', kind: 'number', value: 8 } },
        { kind: 'setTextStyle', style },
        { kind: 'deleteVariable', id: 'ink' },
        { kind: 'deleteTextStyle', id: 'body' }
      ]).success
    ).toBe(true)
  })

  it('refuses a colour that is not hex, and a style with a bad size', () => {
    expect(
      operationBatchSchema.safeParse([
        { kind: 'setVariable', variable: { id: 'ink', name: 'Ink', kind: 'color', value: 'red' } }
      ]).success
    ).toBe(false)
    expect(
      operationBatchSchema.safeParse([{ kind: 'setTextStyle', style: { ...style, fontSize: 0 } }])
        .success
    ).toBe(false)
  })

  it('takes bindings and a text style on an update and on a create', () => {
    expect(
      operationBatchSchema.safeParse([
        { kind: 'update', id: 'a', patch: { bindings: { fill: 'ink' }, textStyleId: 'body' } },
        {
          kind: 'create',
          type: 'text',
          parentId: 'page',
          properties: { textStyleId: 'body', styleOverrides: ['fontSize'] }
        }
      ]).success
    ).toBe(true)
  })

  it('reads a stored document with variables and styles, and one without', () => {
    const document = createDocument('file-a', 'A', 'page-a')
    expect(storedDocumentSchema.safeParse(document).success).toBe(true)
    expect(
      storedDocumentSchema.safeParse({
        ...document,
        variables: { ink: { id: 'ink', name: 'Ink', kind: 'color', value: '#111111' } },
        textStyles: { body: style }
      }).success
    ).toBe(true)
  })
})
