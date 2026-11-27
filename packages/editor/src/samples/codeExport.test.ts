import { resolveMasters } from '@designo/core'
import { CODE_TARGETS, exportNodeToCode } from '@designo/exporter'
import { describe, expect, it } from 'vitest'
import { createPaletteDocument } from './paletteDocument.ts'

const sample = resolveMasters(createPaletteDocument())

describe('code export of the sample', () => {
  it.each(CODE_TARGETS)('writes the auto-layout card as %s', (target) => {
    expect(exportNodeToCode(sample, 'code-card', target)).toMatchSnapshot()
  })

  it.each(CODE_TARGETS)('writes the palette frame, placed absolutely, as %s', (target) => {
    expect(exportNodeToCode(sample, 'frame', target)).toMatchSnapshot()
  })
})
