import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignOperation,
  type PdfTag
} from '@designo/core'

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const INK = '#111111'

interface CvLine {
  id: string
  text: string
  y: number
  fontSize: number
  tag: PdfTag
  fontWeight?: number
  link?: string
}

// Every name, address and employer is made up. A single column of plain text lines, the layout an
// ATS reads best: the ATS check passes it.
const CV_LINES: CvLine[] = [
  { id: 'name', text: 'Jane Doe', y: 48, fontSize: 28, tag: 'h1', fontWeight: 700 },
  {
    id: 'contact',
    text: 'jane.doe@example.com, +49 170 0000000, Berlin',
    y: 88,
    fontSize: 12,
    tag: 'p',
    link: 'mailto:jane.doe@example.com'
  },
  { id: 'summary-heading', text: 'Summary', y: 132, fontSize: 16, tag: 'h2', fontWeight: 700 },
  {
    id: 'summary',
    text: 'Front end engineer with eight years of experience building design tools and component libraries in Vue and TypeScript.',
    y: 158,
    fontSize: 12,
    tag: 'p'
  },
  {
    id: 'experience-heading',
    text: 'Experience',
    y: 226,
    fontSize: 16,
    tag: 'h2',
    fontWeight: 700
  },
  {
    id: 'job-1',
    text: 'Senior Engineer, Example Studio, 2021 to now',
    y: 252,
    fontSize: 13,
    tag: 'h3',
    fontWeight: 700
  },
  {
    id: 'job-1-detail',
    text: 'Led a canvas editor used by forty designers. Cut export time by half with a shared layout engine.',
    y: 274,
    fontSize: 12,
    tag: 'p'
  },
  {
    id: 'job-2',
    text: 'Engineer, Sample Software GmbH, 2017 to 2021',
    y: 332,
    fontSize: 13,
    tag: 'h3',
    fontWeight: 700
  },
  {
    id: 'job-2-detail',
    text: 'Built a design system with accessible components and a documented release process.',
    y: 354,
    fontSize: 12,
    tag: 'p'
  },
  { id: 'education-heading', text: 'Education', y: 424, fontSize: 16, tag: 'h2', fontWeight: 700 },
  {
    id: 'education',
    text: 'BSc Computer Science, Example University, 2013 to 2017',
    y: 450,
    fontSize: 12,
    tag: 'p'
  },
  { id: 'skills-heading', text: 'Skills', y: 494, fontSize: 16, tag: 'h2', fontWeight: 700 },
  {
    id: 'skills',
    text: 'TypeScript, Vue, WebGL, accessibility, design systems, testing',
    y: 520,
    fontSize: 12,
    tag: 'p'
  }
]

const lineOperation = (line: CvLine): DesignOperation => ({
  kind: 'create',
  id: `cv-${line.id}`,
  type: 'text',
  parentId: 'cv-page',
  properties: {
    x: MARGIN,
    y: line.y,
    width: CONTENT_WIDTH,
    text: line.text,
    textWrap: true,
    fontSize: line.fontSize,
    fontWeight: line.fontWeight ?? 400,
    fill: INK,
    pdfTag: line.tag,
    link: line.link ?? null
  }
})

/**
 * Builds a made-up one page CV, the sample to try the ATS check on: one column, plain headings,
 * contact details up top and a title, author and language in the PDF.
 * @returns The sample document.
 */
export const createCvDocument = (): DesignDocument => {
  const result = applyOperations(createDocument('sample-cv', 'Sample: CV', 'page'), [
    {
      kind: 'create',
      id: 'cv-page',
      type: 'frame',
      parentId: 'page',
      properties: {
        name: 'CV',
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        fill: '#ffffff',
        pdfPage: 1
      }
    },
    ...CV_LINES.map(lineOperation),
    { kind: 'updateMetadata', patch: { title: 'Jane Doe, CV', author: 'Jane Doe', language: 'en' } }
  ])
  if (!result.ok) throw new Error(result.error)
  return result.document
}
