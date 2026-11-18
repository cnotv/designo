import { describe, expect, it } from 'vitest'
import { nodePatchSchema, operationBatchSchema } from './schemas.ts'

describe('text properties in a patch', () => {
  it('accepts each alignment, a line height and the wrap switch', () => {
    ;['left', 'center', 'right'].forEach((textAlign) => {
      expect(nodePatchSchema.safeParse({ textAlign }).success).toBe(true)
    })
    expect(nodePatchSchema.safeParse({ lineHeight: 1.6, textWrap: true }).success).toBe(true)
  })

  it('rejects an alignment it does not know, as CSS "justify" would be', () => {
    expect(nodePatchSchema.safeParse({ textAlign: 'justify' }).success).toBe(false)
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
