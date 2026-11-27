import { describe, expect, it } from 'vitest'
import { buildHtmlReport, buildMarkdownSummary, isParityRunPassing } from './report.ts'
import type { CaseResult, RendererResult } from './types.ts'

const result = (renderer: 'webgl' | 'pdf', share: number, passed: boolean): RendererResult => ({
  renderer,
  passed,
  tolerance: { channelThreshold: 16, maxDifferingShare: 0.02 },
  comparison: {
    differingPixels: 1,
    differingShare: share,
    largestChannelDifference: 40,
    diffImage: { width: 1, height: 1, pixels: new Uint8Array(4) }
  }
})

const passing: CaseResult = {
  name: 'blur',
  description: 'A <blurred> ellipse',
  results: [result('webgl', 0.0033, true), result('pdf', 0, true)]
}
const failing: CaseResult = {
  name: 'shadow',
  description: 'A shadow',
  results: [result('webgl', 0.11, false), result('pdf', 0.004, true)]
}

describe('parity report', () => {
  it('fails a run when any renderer of any case drifted', () => {
    expect(isParityRunPassing([passing])).toBe(true)
    expect(isParityRunPassing([passing, failing])).toBe(false)
  })

  it('summarises each case and renderer in a table row', () => {
    const summary = buildMarkdownSummary([passing, failing])
    expect(summary).toContain(
      '| blur | webgl | pass: 0.33% of pixels differ (at most 2.00% beyond 16/255), largest channel difference 40 |'
    )
    expect(summary).toContain('| shadow | webgl | FAIL: 11.00% of pixels differ')
  })

  it('links every image of a case and escapes its description', () => {
    const html = buildHtmlReport([failing, passing])
    expect(html).toContain('a renderer drifted')
    expect(html).toContain('src="shadow/webgl-diff.png"')
    expect(html).toContain('src="blur/reference.png"')
    expect(html).toContain('A &lt;blurred&gt; ellipse')
  })
})
