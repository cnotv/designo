import type { CaseResult, RendererResult } from './types.ts'

const PERCENT = 100

const formatShare = (share: number): string => `${(share * PERCENT).toFixed(2)}%`

const describeResult = (result: RendererResult): string =>
  `${result.passed ? 'pass' : 'FAIL'}: ${formatShare(result.comparison.differingShare)} of pixels differ (at most ${formatShare(result.tolerance.maxDifferingShare)} beyond ${result.tolerance.channelThreshold}/255), largest channel difference ${result.comparison.largestChannelDifference}`

/**
 * Whether every renderer of every case stayed within its tolerance.
 * @param cases - The results of a run.
 * @returns True when the run passes.
 */
export const isParityRunPassing = (cases: readonly CaseResult[]): boolean =>
  cases.every((parityCase) => parityCase.results.every((result) => result.passed))

/**
 * A Markdown table of a run, for the terminal and for a CI job summary.
 * @param cases - The results of a run.
 * @returns The table, one row per case and renderer.
 */
export const buildMarkdownSummary = (cases: readonly CaseResult[]): string =>
  [
    '| Case | Renderer | Result |',
    '| --- | --- | --- |',
    ...cases.flatMap((parityCase) =>
      parityCase.results.map(
        (result) => `| ${parityCase.name} | ${result.renderer} | ${describeResult(result)} |`
      )
    )
  ].join('\n')

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const figure = (source: string, caption: string): string =>
  `<figure><img src="${source}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`

const renderCaseSection = (parityCase: CaseResult): string =>
  [
    `<section><h2>${escapeHtml(parityCase.name)}</h2><p>${escapeHtml(parityCase.description)}</p>`,
    '<div class="row">',
    figure(`${parityCase.name}/reference.png`, 'resvg (reference)'),
    ...parityCase.results.flatMap((result) => [
      figure(`${parityCase.name}/${result.renderer}.png`, result.renderer),
      figure(`${parityCase.name}/${result.renderer}-diff.png`, `${result.renderer} differences`)
    ]),
    '</div>',
    ...parityCase.results.map(
      (result) =>
        `<p class="${result.passed ? 'pass' : 'fail'}">${result.renderer}: ${escapeHtml(describeResult(result))}</p>`
    ),
    '</section>'
  ].join('')

const STYLE =
  'body{font:14px system-ui,sans-serif;margin:24px;color:#111;background:#fafafa}' +
  '.row{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0}img{display:block;border:1px solid #ccc;background:#fff}' +
  'figcaption{font-size:12px;color:#555}.pass{color:#166534}.fail{color:#b91c1c;font-weight:600}'

/**
 * A page that shows every case as each renderer drew it, with the differing pixels in red.
 * @param cases - The results of a run, whose images sit beside the page in a folder per case.
 * @returns The HTML page.
 */
export const buildHtmlReport = (cases: readonly CaseResult[]): string =>
  [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Render parity</title>',
    `<style>${STYLE}</style></head><body>`,
    `<h1>Render parity: ${isParityRunPassing(cases) ? 'every renderer within tolerance' : 'a renderer drifted'}</h1>`,
    '<p>Each case is drawn by resvg from the SVG export, by the editor&#39;s WebGL renderer, and by pdf.js from the PDF export. Red marks the pixels that differ from resvg beyond the threshold.</p>',
    ...cases.map(renderCaseSection),
    '</body></html>'
  ].join('\n')
