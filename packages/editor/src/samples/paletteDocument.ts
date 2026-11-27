import {
  applyOperations,
  createDocument,
  DEFAULT_NODE_PROPERTIES,
  getBooleanOperations,
  millimetresToPoints,
  type DesignDocument,
  type DesignOperation,
  type TextSpan
} from '@designo/core'

const SWATCH_COLORS = ['#1b4332', '#2d6a4f', '#52b788', '#d8f3dc', '#f4a261']
const SWATCH_STEP = 120
const PAGE_BLEED_MILLIMETRES = 3
const SWATCH_LEFT = 32

const swatchOperations = (color: string, position: number): DesignOperation[] => [
  {
    kind: 'create',
    id: `swatch-${position}`,
    type: 'rectangle',
    parentId: 'frame',
    properties: {
      x: SWATCH_LEFT + position * SWATCH_STEP,
      y: 80,
      width: 96,
      height: 112,
      fill: color,
      cornerRadius: 12
    }
  },
  {
    kind: 'create',
    id: `label-${position}`,
    type: 'text',
    parentId: 'frame',
    properties: {
      x: SWATCH_LEFT + position * SWATCH_STEP,
      y: 204,
      text: color,
      fontSize: 14,
      fill: '#555555',
      bindings: { fill: 'caption' }
    }
  }
]

// The palette's ink and caption colours are variables, and the title is a text style, so a change
// to one reaches every node that uses it.
const styleOperations = (): DesignOperation[] => [
  { kind: 'setVariable', variable: { id: 'ink', name: 'Ink', kind: 'color', value: '#111111' } },
  {
    kind: 'setVariable',
    variable: { id: 'caption', name: 'Caption', kind: 'color', value: '#555555' }
  },
  {
    kind: 'setTextStyle',
    style: {
      id: 'heading',
      name: 'Heading',
      fontFamily: DEFAULT_NODE_PROPERTIES.fontFamily,
      fontSize: 24,
      fontWeight: 400,
      fontStyle: 'normal',
      lineHeight: 1.2,
      letterSpacing: 0
    }
  }
]

const WASH_STOPS = [
  { offset: 0, color: '#ff5a36' },
  { offset: 0.5, color: '#ffd23f' },
  { offset: 1, color: '#3b82f6' }
]

// A row under the swatches that shows each effect: gradients, blur, a shadow and multiply.
const effectOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'effect-linear',
    type: 'rectangle',
    parentId: 'frame',
    properties: {
      x: 32,
      y: 270,
      width: 120,
      height: 80,
      cornerRadius: 12,
      gradient: { kind: 'linear', angle: 30, stops: WASH_STOPS }
    }
  },
  {
    kind: 'create',
    id: 'effect-radial',
    type: 'ellipse',
    parentId: 'frame',
    properties: {
      x: 168,
      y: 270,
      width: 120,
      height: 80,
      gradient: { kind: 'radial', angle: 0, stops: WASH_STOPS }
    }
  },
  {
    kind: 'create',
    id: 'effect-blur',
    type: 'ellipse',
    parentId: 'frame',
    properties: { x: 304, y: 270, width: 110, height: 80, fill: '#2563eb', blur: 8 }
  },
  {
    kind: 'create',
    id: 'effect-shadow',
    type: 'rectangle',
    parentId: 'frame',
    properties: {
      x: 436,
      y: 272,
      width: 80,
      height: 70,
      fill: '#ffffff',
      cornerRadius: 10,
      shadow: { x: 6, y: 8, blur: 6, color: '#000000a0' }
    }
  },
  {
    kind: 'create',
    id: 'effect-multiply-red',
    type: 'ellipse',
    parentId: 'frame',
    properties: { x: 530, y: 268, width: 70, height: 70, fill: '#ef4444', blendMode: 'multiply' }
  },
  {
    kind: 'create',
    id: 'effect-multiply-blue',
    type: 'ellipse',
    parentId: 'frame',
    properties: { x: 566, y: 296, width: 60, height: 60, fill: '#3b82f6', blendMode: 'multiply' }
  }
]

const PAGE_FRAME_SIZE = 380
const MIXED_SCRIPT_TEXT = 'Hello, שלום, مرحبا, नमस्ते in one line'
const PAGE_FRAME_LEFT = 700
const PAGE_FRAME_GAP = 40

// Two frames to select and export: each is a page of the PDF, and the palette frame is not. The
// second has 3 mm of bleed, so its PDF page is larger than the frame, with a bleed and a trim box.
const pageFrameOperations = (position: number): DesignOperation[] => {
  const id = `page-${position + 1}`
  const left = PAGE_FRAME_LEFT + position * (PAGE_FRAME_SIZE + PAGE_FRAME_GAP)
  return [
    {
      kind: 'create',
      id,
      type: 'frame',
      parentId: 'page',
      properties: {
        name: `Page ${position + 1}`,
        x: left,
        y: 0,
        width: PAGE_FRAME_SIZE,
        height: PAGE_FRAME_SIZE,
        fill: SWATCH_COLORS[position + 3] ?? '#ffffff',
        pdfPage: position + 1,
        bleed: position === 1 ? millimetresToPoints(PAGE_BLEED_MILLIMETRES) : 0
      }
    },
    {
      kind: 'create',
      id: `${id}-title`,
      type: 'text',
      parentId: id,
      properties: {
        x: left + SWATCH_LEFT,
        y: 28,
        text: `Page ${position + 1}`,
        fontSize: 24,
        fill: '#111111'
      }
    }
  ]
}

const FORMATTED_TEXT = 'Print ready: bold, italic and coloured words share one line.'
const FORMATTED_WORDS = [
  { word: 'bold', fontWeight: 700 },
  { word: 'italic', fontStyle: 'italic' as const },
  { word: 'coloured', fill: '#d62828' }
]

// Spans found by their words, so editing the sentence cannot leave offsets pointing at the wrong place.
const formattedSpans = (): TextSpan[] =>
  FORMATTED_WORDS.map(({ word, ...format }) => ({
    start: FORMATTED_TEXT.indexOf(word),
    end: FORMATTED_TEXT.indexOf(word) + word.length,
    ...format
  })).toSorted((first, second) => first.start - second.start)

// On the page with bleed: text with a weight, a slant and a colour of its own in the same line.
const formattedTextOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'page-2-formatted',
    type: 'text',
    parentId: 'page-2',
    properties: {
      x: PAGE_FRAME_LEFT + (PAGE_FRAME_SIZE + PAGE_FRAME_GAP) + SWATCH_LEFT,
      y: 96,
      width: PAGE_FRAME_SIZE - SWATCH_LEFT * 2,
      text: FORMATTED_TEXT,
      textWrap: true,
      fontSize: 18,
      fill: '#111111',
      spans: formattedSpans()
    }
  }
]

// On page 2, saturated screen colours a CMYK export cannot match, to compare the RGB and CMYK PDFs.
const printColorOperations = (): DesignOperation[] => {
  const left = PAGE_FRAME_LEFT + (PAGE_FRAME_SIZE + PAGE_FRAME_GAP) + SWATCH_LEFT
  const width = PAGE_FRAME_SIZE - SWATCH_LEFT * 2
  return [
    {
      kind: 'create',
      id: 'page-2-print-colors',
      type: 'rectangle',
      parentId: 'page-2',
      properties: {
        name: 'Print colours',
        x: left,
        y: 200,
        width,
        height: 48,
        cornerRadius: 8,
        gradient: {
          kind: 'linear',
          angle: 90,
          stops: [
            { offset: 0, color: '#0047ff' },
            { offset: 1, color: '#00e676' }
          ]
        }
      }
    },
    {
      kind: 'create',
      id: 'page-2-print-caption',
      type: 'text',
      parentId: 'page-2',
      properties: {
        x: left,
        y: 256,
        width,
        text: 'Export the PDF as CMYK: this blue and green print duller than the screen shows.',
        textWrap: true,
        fontSize: 12,
        fill: '#111111'
      }
    }
  ]
}

// On page 1, one line in four scripts, so its glyphs come from several fallback fonts; a screenshot
// draws it as glyph outlines, with no missing-glyph boxes.
const mixedScriptOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'page-1-mixed-scripts',
    type: 'text',
    parentId: 'page-1',
    properties: {
      name: 'Mixed scripts',
      x: PAGE_FRAME_LEFT + SWATCH_LEFT,
      y: 200,
      width: PAGE_FRAME_SIZE - SWATCH_LEFT * 2,
      height: 24,
      text: MIXED_SCRIPT_TEXT,
      textWrap: true,
      fontSize: 16,
      fill: '#111111'
    }
  }
]

// On page 1, for the ATS check: a contact line a parser reads as it is, and a blurred line, which a
// PDF draws as an image, so no parser can read it and the check fails it.
const atsOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'page-1-contact',
    type: 'text',
    parentId: 'page-1',
    properties: {
      x: PAGE_FRAME_LEFT + SWATCH_LEFT,
      y: 96,
      width: PAGE_FRAME_SIZE - SWATCH_LEFT * 2,
      text: 'Jane Doe, jane@example.com',
      textWrap: true,
      fontSize: 18,
      fill: '#111111'
    }
  },
  {
    kind: 'create',
    id: 'page-1-blurred',
    type: 'text',
    parentId: 'page-1',
    properties: {
      x: PAGE_FRAME_LEFT + SWATCH_LEFT,
      y: 140,
      width: PAGE_FRAME_SIZE - SWATCH_LEFT * 2,
      text: 'Blurred: not readable by a parser',
      textWrap: true,
      fontSize: 18,
      fill: '#111111',
      blur: 1
    }
  }
]

// A master holds a rule and a page number once; both page frames name it, so each shows its own number.
const masterOperations = (): DesignOperation[] => {
  const left = PAGE_FRAME_LEFT + 2 * (PAGE_FRAME_SIZE + PAGE_FRAME_GAP)
  return [
    {
      kind: 'create',
      id: 'master',
      type: 'frame',
      parentId: 'page',
      properties: {
        name: 'Master: page number',
        x: left,
        y: 0,
        width: PAGE_FRAME_SIZE,
        height: PAGE_FRAME_SIZE,
        fill: '#f4f4f4'
      }
    },
    { kind: 'update', id: 'master', patch: { isMaster: true } },
    {
      kind: 'create',
      id: 'master-rule',
      type: 'rectangle',
      parentId: 'master',
      properties: {
        x: left + SWATCH_LEFT,
        y: PAGE_FRAME_SIZE - 56,
        width: 300,
        height: 1,
        fill: '#111111'
      }
    },
    {
      kind: 'create',
      id: 'master-page-number',
      type: 'text',
      parentId: 'master',
      properties: {
        x: left + SWATCH_LEFT,
        y: PAGE_FRAME_SIZE - 44,
        width: 300,
        text: 'Page {page}',
        textWrap: true,
        textAlign: 'center',
        fontSize: 14,
        fill: '#111111'
      }
    }
  ]
}

const PATH_ROW_TOP = 440
const PATH_STEP = 130

const CODE_CARD_LEFT = 540
const CODE_CARD_TOP = 420

// Text boxes are sized to their words at the sample's font sizes, as the editor would fit them.
const codeCardButton = (
  id: string,
  label: { text: string; width: number },
  fill: string,
  ink: string
): DesignOperation[] => [
  {
    kind: 'create',
    id,
    type: 'frame',
    parentId: 'code-card-actions',
    properties: {
      name: `${label.text} button`,
      fill,
      cornerRadius: 8,
      layoutMode: 'horizontal',
      layoutPadding: 8,
      widthSizing: 'hug',
      heightSizing: 'hug'
    }
  },
  {
    kind: 'create',
    id: `${id}-label`,
    type: 'text',
    parentId: id,
    properties: {
      name: `${label.text} label`,
      text: label.text,
      width: label.width,
      height: 17,
      fontSize: 14,
      fill: ink
    }
  }
]

// An auto-layout card, which code export turns into nested flex boxes: a heading, a paragraph that
// fills the card's width, and a row of two buttons that hug their labels.
const codeCardOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'code-card',
    type: 'frame',
    parentId: 'page',
    properties: {
      name: 'Code card',
      x: CODE_CARD_LEFT,
      y: CODE_CARD_TOP,
      width: 260,
      height: 100,
      fill: '#ffffff',
      stroke: '#d0d0d0',
      cornerRadius: 12,
      layoutMode: 'vertical',
      layoutGap: 12,
      layoutPadding: 16,
      heightSizing: 'hug'
    }
  },
  {
    kind: 'create',
    id: 'code-card-heading',
    type: 'text',
    parentId: 'code-card',
    properties: {
      name: 'Heading',
      text: 'Export as code',
      width: 150,
      height: 24,
      fontSize: 20,
      fontWeight: 700,
      fill: '#111111',
      pdfTag: 'h2'
    }
  },
  {
    kind: 'create',
    id: 'code-card-body',
    type: 'text',
    parentId: 'code-card',
    properties: {
      name: 'Body',
      text: 'This card is an auto-layout frame, so HTML, Vue, React and JavaScript get flex boxes.',
      height: 51,
      fontSize: 14,
      fill: '#555555',
      textWrap: true,
      widthSizing: 'fill'
    }
  },
  {
    kind: 'create',
    id: 'code-card-actions',
    type: 'frame',
    parentId: 'code-card',
    properties: {
      name: 'Actions',
      fill: null,
      layoutMode: 'horizontal',
      layoutGap: 8,
      widthSizing: 'hug',
      heightSizing: 'hug'
    }
  },
  ...codeCardButton('code-card-primary', { text: 'Copy', width: 34 }, '#2d6a4f', '#ffffff'),
  ...codeCardButton('code-card-secondary', { text: 'Download', width: 67 }, '#d8f3dc', '#1b4332')
]

// A star drawn with straight segments, a leaf with curves, and two circle pairs that become one
// path each: a union, and a ring cut from a disc.
const shapeOperations = (): DesignOperation[] => [
  {
    kind: 'create',
    id: 'path-star',
    type: 'path',
    parentId: 'page',
    properties: {
      name: 'Star',
      x: SWATCH_LEFT,
      y: PATH_ROW_TOP,
      width: 80,
      height: 78,
      fill: '#f4a261',
      pathData: 'M40,0L50,28L80,30L56,48L64,78L40,60L16,78L24,48L0,30L30,28Z'
    }
  },
  {
    kind: 'create',
    id: 'path-leaf',
    type: 'path',
    parentId: 'page',
    properties: {
      name: 'Leaf',
      x: SWATCH_LEFT + PATH_STEP,
      y: PATH_ROW_TOP,
      width: 60,
      height: 80,
      fill: '#52b788',
      stroke: '#1b4332',
      strokeWidth: 3,
      pathData: 'M30,0C70,30 70,60 30,80C-10,60 -10,30 30,0Z'
    }
  },
  ...[0, 1].flatMap((position): DesignOperation[] => [
    {
      kind: 'create',
      id: `combine-${position}-a`,
      type: 'ellipse',
      parentId: 'page',
      properties: {
        x: SWATCH_LEFT + PATH_STEP * (position + 2),
        y: PATH_ROW_TOP,
        width: 70,
        height: 70,
        fill: '#2d6a4f'
      }
    },
    {
      kind: 'create',
      id: `combine-${position}-b`,
      type: 'ellipse',
      parentId: 'page',
      properties: {
        x: SWATCH_LEFT + PATH_STEP * (position + 2) + 35,
        y: PATH_ROW_TOP + 10,
        width: 70,
        height: 70
      }
    }
  ])
]

// The two circle pairs are combined as the editor combines a selection, so the sample holds what
// the union and subtract commands make.
const combineOperations = (document: DesignDocument): DesignOperation[] => [
  ...getBooleanOperations(document, ['combine-0-a', 'combine-0-b'], 'union', 'path-union'),
  ...getBooleanOperations(document, ['combine-1-a', 'combine-1-b'], 'subtract', 'path-subtract')
]

/**
 * Builds the sample file the editor shows when no Designo server is behind it, as on the public demo: a palette, two frames numbered as the pages of its PDF, and a master that gives both a page number. Page 1 holds one line the ATS check passes and one it fails.
 * @returns The sample document.
 */
export const createPaletteDocument = (): DesignDocument => {
  const base = applyOperations(createDocument('sample-palette', 'Sample: palette', 'page'), [
    ...styleOperations(),
    {
      kind: 'create',
      id: 'frame',
      type: 'frame',
      parentId: 'page',
      properties: { width: 640, height: 380, fill: '#ffffff', stroke: '#e3e3e3', cornerRadius: 20 }
    },
    {
      kind: 'create',
      id: 'title',
      type: 'text',
      parentId: 'frame',
      properties: {
        x: SWATCH_LEFT,
        y: 28,
        text: 'Forest palette',
        fill: '#111111',
        bindings: { fill: 'ink' },
        textStyleId: 'heading'
      }
    },
    ...SWATCH_COLORS.flatMap(swatchOperations),
    ...effectOperations(),
    ...pageFrameOperations(0),
    ...pageFrameOperations(1),
    ...formattedTextOperations(),
    ...printColorOperations(),
    ...mixedScriptOperations(),
    ...atsOperations(),
    ...masterOperations(),
    { kind: 'update', id: 'page-1', patch: { masterId: 'master' } },
    { kind: 'update', id: 'page-2', patch: { masterId: 'master' } },
    ...shapeOperations(),
    ...codeCardOperations()
  ])
  if (!base.ok) throw new Error(base.error)
  const result = applyOperations(base.document, combineOperations(base.document))
  if (!result.ok) throw new Error(result.error)
  return result.document
}
