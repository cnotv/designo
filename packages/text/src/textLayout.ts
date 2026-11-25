import type { ListStyle, TextAlign, TextSpan } from '@designo/core'
import { getTextBaselineOffset } from './baseline.ts'
import { getVisualOrder, resolveBidiLevels } from './bidi.ts'
import {
  FIT_TOLERANCE,
  findBreakChunks,
  findGraphemeCuts,
  fillLines,
  splitParagraphs,
  type Paragraph
} from './lineBreaking.ts'
import type {
  BreakChunk,
  LaidOutLine,
  PlacedGlyph,
  ShapedRun,
  TextDirection,
  TextLayout,
  TextLayoutInput,
  TextShaper
} from './types.ts'

/** One stretch of a paragraph at one embedding level, shaped. Its glyphs are already visual. */
interface ShapedPiece {
  start: number
  end: number
  level: number
  runs: readonly ShapedRun[]
  width: number
  /** The span the piece is drawn in, an index into the layout's spans; -1 for the node's own style. */
  spanIndex: number
}

/** A chunk shaped, with its content and its trailing spaces measured apart. */
interface MeasuredChunk extends BreakChunk {
  contentPieces: readonly ShapedPiece[]
  trailingPieces: readonly ShapedPiece[]
  contentWidth: number
  trailingWidth: number
}

interface ParagraphLine {
  paragraph: Paragraph
  direction: TextDirection
  start: number
  end: number
  /** Pieces in reading order, without the spaces that hang at the line's end. */
  pieces: readonly ShapedPiece[]
  width: number
  /** True for the last line of its paragraph, which justified text leaves ragged. */
  endsParagraph: boolean
  startsParagraph: boolean
}

interface ParagraphContext {
  paragraph: Paragraph
  levels: readonly number[]
  direction: TextDirection
  shaper: TextShaper
  spans: readonly TextSpan[]
  /** The shaper of each span, in the spans' order; a span without one is shaped with `shaper`. */
  spanShapers: readonly TextShaper[]
  fontSize: number
  /** Extra space after every glyph, in world units. */
  letterSpacing: number
  wrapWidth: number | undefined
}

const sumBy = <Item>(items: readonly Item[], measure: (item: Item) => number): number =>
  items.reduce((total, item) => total + measure(item), 0)

const directionOfLevel = (level: number): TextDirection => (level % 2 === 1 ? 'rtl' : 'ltr')

// Advances are in font units, and a fallback font can have a different em, so each run scales
// by its own.
const worldUnitsPerFontUnit = (run: ShapedRun, fontSize: number): number =>
  fontSize / run.unitsPerEm

const measureRuns = (runs: readonly ShapedRun[], fontSize: number, letterSpacing: number): number =>
  sumBy(runs, (run) =>
    sumBy(
      run.glyphs,
      (glyph) => glyph.xAdvance * worldUnitsPerFontUnit(run, fontSize) + letterSpacing
    )
  )

const splitByLevel = (
  levels: readonly number[],
  start: number,
  end: number
): { start: number; end: number; level: number }[] =>
  levels
    .slice(start, end)
    .reduce<{ start: number; end: number; level: number }[]>((stretches, level, offset) => {
      const last = stretches.at(-1)
      return last && last.level === level
        ? [...stretches.slice(0, -1), { ...last, end: start + offset + 1 }]
        : [...stretches, { start: start + offset, end: start + offset + 1, level }]
    }, [])

// Cuts a stretch of a paragraph where a span starts or ends, so each part is shaped in one font.
const splitBySpan = (
  context: ParagraphContext,
  stretch: { start: number; end: number; level: number }
): { start: number; end: number; level: number; spanIndex: number }[] => {
  const offset = context.paragraph.start
  const cuts = [
    ...new Set([
      stretch.start,
      stretch.end,
      ...context.spans
        .flatMap((span) => [span.start - offset, span.end - offset])
        .filter((cut) => cut > stretch.start && cut < stretch.end)
    ])
  ].toSorted((first, second) => first - second)
  return cuts.slice(1).map((end, index) => {
    const start = cuts[index] ?? stretch.start
    const spanIndex = context.spans.findIndex(
      (span) => span.start - offset <= start && end <= span.end - offset
    )
    return { start, end, level: stretch.level, spanIndex }
  })
}

const shapeRange = (context: ParagraphContext, start: number, end: number): ShapedPiece[] =>
  splitByLevel(context.levels, start, end)
    .flatMap((stretch) => splitBySpan(context, stretch))
    .map((stretch) => {
      const shaper = context.spanShapers[stretch.spanIndex] ?? context.shaper
      const runs = shaper.shapeRuns(
        context.paragraph.text.slice(stretch.start, stretch.end),
        directionOfLevel(stretch.level)
      )
      return { ...stretch, runs, width: measureRuns(runs, context.fontSize, context.letterSpacing) }
    })

const measureChunk = (context: ParagraphContext, chunk: BreakChunk): MeasuredChunk => {
  const contentPieces = shapeRange(context, chunk.start, chunk.contentEnd)
  const trailingPieces = shapeRange(context, chunk.contentEnd, chunk.end)
  return {
    ...chunk,
    contentPieces,
    trailingPieces,
    contentWidth: sumBy(contentPieces, (piece) => piece.width),
    trailingWidth: sumBy(trailingPieces, (piece) => piece.width)
  }
}

const measureRangeWidth = (context: ParagraphContext, start: number, end: number): number =>
  sumBy(shapeRange(context, start, end), (piece) => piece.width)

const splitOversizedChunk = (
  context: ParagraphContext,
  chunk: BreakChunk,
  wrapWidth: number
): MeasuredChunk[] => {
  const cuts = findGraphemeCuts(context.paragraph.text, chunk, wrapWidth, (start, end) =>
    measureRangeWidth(context, start, end)
  )
  return cuts.map((cut, index) => {
    const start = index === 0 ? chunk.start : (cuts[index - 1] ?? chunk.start)
    const isLast = index === cuts.length - 1
    // The spaces after the word belong to its last piece, where they can hang at a wrap.
    return measureChunk(context, { start, contentEnd: cut, end: isLast ? chunk.end : cut })
  })
}

const measureChunks = (context: ParagraphContext, chunks: readonly BreakChunk[]): MeasuredChunk[] =>
  chunks.flatMap((chunk) => {
    const measured = measureChunk(context, chunk)
    const { wrapWidth } = context
    return wrapWidth !== undefined && measured.contentWidth > wrapWidth + FIT_TOLERANCE
      ? splitOversizedChunk(context, chunk, wrapWidth)
      : [measured]
  })

const toParagraphLine = (
  context: ParagraphContext,
  chunks: readonly MeasuredChunk[]
): ParagraphLine => {
  const { paragraph, direction } = context
  const last = chunks.at(-1)
  const pieces = chunks.flatMap((chunk) =>
    chunk === last ? chunk.contentPieces : [...chunk.contentPieces, ...chunk.trailingPieces]
  )
  return {
    paragraph,
    direction,
    start: paragraph.start + (chunks[0]?.start ?? 0),
    end: paragraph.start + (last?.contentEnd ?? 0),
    pieces,
    width: sumBy(pieces, (piece) => piece.width),
    endsParagraph: false,
    startsParagraph: false
  }
}

const breakParagraphIntoLines = (
  paragraph: Paragraph,
  shapers: Pick<ParagraphContext, 'shaper' | 'spans' | 'spanShapers'>,
  fontSize: number,
  letterSpacing: number,
  wrapWidth: number | undefined
): ParagraphLine[] => {
  const { levels, baseDirection } = resolveBidiLevels(paragraph.text)
  const context: ParagraphContext = {
    paragraph,
    levels,
    direction: baseDirection,
    ...shapers,
    fontSize,
    letterSpacing,
    wrapWidth
  }
  const chunks = measureChunks(context, findBreakChunks(paragraph.text))
  const lines = chunks.length === 0 ? [[]] : fillLines(chunks, wrapWidth)
  return lines.map((lineChunks, index) => ({
    ...toParagraphLine(context, lineChunks),
    endsParagraph: index === lines.length - 1,
    startsParagraph: index === 0
  }))
}

/** The space added to the advances of a line's glyphs, beyond what the font says. */
interface GlyphSpacing {
  perGlyph: number
  /** Extra after each space, which stretches a justified line to the box's width. */
  perSpace: number
  isSpace: (cluster: number) => boolean
}

const SPACE = ' '

// Only the lines that wrap are stretched: a paragraph's last line, and an auto-width box, keep the
// font's own spacing, as CSS leaves them.
const justifyExtraPerSpace = (
  line: ParagraphLine,
  text: string,
  boxWidth: number,
  isJustified: boolean
): number => {
  if (!isJustified || line.endsParagraph) return 0
  const spaceCount = [...text.slice(line.start, line.end)].filter((c) => c === SPACE).length
  return spaceCount === 0 ? 0 : Math.max(0, boxWidth - line.width) / spaceCount
}

const alignmentOffset = (alignment: TextAlign, boxWidth: number, lineWidth: number): number => {
  if (alignment === 'center') return (boxWidth - lineWidth) / 2
  return alignment === 'right' ? boxWidth - lineWidth : 0
}

interface RunPlacement {
  originX: number
  baselineY: number
  clusterBase: number
  fontSize: number
  spacing: GlyphSpacing
  /** The colour of the span the run is in; undefined follows the node. */
  fill?: string
}

const placeRunGlyphs = (
  run: ShapedRun,
  { originX, baselineY, clusterBase, fontSize, spacing, fill }: RunPlacement
): { glyphs: PlacedGlyph[]; endX: number } => {
  const scale = worldUnitsPerFontUnit(run, fontSize)
  const glyphs: PlacedGlyph[] = []
  const endX = run.glyphs.reduce((penX, glyph) => {
    glyphs.push({
      fontId: run.fontId,
      glyphId: glyph.glyphId,
      x: penX + glyph.xOffset * scale,
      // HarfBuzz measures y upward and the canvas downward.
      y: baselineY - glyph.yOffset * scale,
      cluster: clusterBase + glyph.cluster,
      scale,
      ...(fill === undefined ? {} : { fill })
    })
    const justifyExtra = spacing.isSpace(clusterBase + glyph.cluster) ? spacing.perSpace : 0
    return penX + glyph.xAdvance * scale + spacing.perGlyph + justifyExtra
  }, originX)
  return { glyphs, endX }
}

interface LinePlacement {
  spans: readonly TextSpan[]
  originX: number
  baselineY: number
  fontSize: number
  spacing: GlyphSpacing
}

const placeLineGlyphs = (
  line: ParagraphLine,
  { spans, originX, baselineY, fontSize, spacing }: LinePlacement
): PlacedGlyph[] => {
  const visualPieces = getVisualOrder(line.pieces.map((piece) => piece.level)).flatMap(
    (index) => line.pieces[index] ?? []
  )
  const placed = visualPieces
    .flatMap((piece) =>
      piece.runs.map((run) => ({
        run,
        clusterBase: line.paragraph.start + piece.start,
        fill: spans[piece.spanIndex]?.fill
      }))
    )
    .reduce<{ glyphs: PlacedGlyph[]; penX: number }>(
      ({ glyphs, penX }, { run, clusterBase, fill }) => {
        const result = placeRunGlyphs(run, {
          originX: penX,
          baselineY,
          clusterBase,
          fontSize,
          spacing,
          fill
        })
        return { glyphs: [...glyphs, ...result.glyphs], penX: result.endX }
      },
      { glyphs: [], penX: originX }
    )
  return placed.glyphs
}

const BULLET = '\u2022'

const getMarker = (listStyle: ListStyle, paragraphIndex: number): string | undefined => {
  if (listStyle === 'bullet') return BULLET
  return listStyle === 'number' ? `${paragraphIndex + 1}.` : undefined
}

// The marker hangs in the margin on a paragraph's first line. Its glyphs stand for no character
// of the text, so they carry the line's start as their cluster and the character they draw.
const placeMarker = (
  marker: string,
  shaper: TextShaper,
  line: ParagraphLine,
  baselineY: number,
  fontSize: number
): PlacedGlyph[] =>
  shaper
    .shapeRuns(marker, 'ltr')
    .reduce<{ glyphs: PlacedGlyph[]; penX: number }>(
      ({ glyphs, penX }, run) => {
        const result = placeRunGlyphs(run, {
          originX: penX,
          baselineY,
          clusterBase: 0,
          fontSize,
          spacing: { perGlyph: 0, perSpace: 0, isSpace: () => false }
        })
        return { glyphs: [...glyphs, ...result.glyphs], penX: result.endX }
      },
      { glyphs: [], penX: 0 }
    )
    .glyphs.map((glyph) => ({
      ...glyph,
      markerText: marker.slice(glyph.cluster, glyph.cluster + 1),
      cluster: line.start
    }))

/**
 * Lays text out: breaks it into lines, orders each line for display, positions every glyph and
 * works out the box the text fills. Pure given the shaper, so it runs in Node with no canvas.
 *
 * Lines break at hard line breaks and, when `wrapWidth` is set, at Unicode word boundaries
 * measured with shaped advances; a word wider than the box breaks between characters. Lines are
 * `lineHeight` times the font size apart with the baseline placed as CSS does, so the canvas
 * agrees with the text editor's textarea. Alignment is physical: `left` is the left edge for
 * right to left text too.
 * @param input - The text, font size, alignment, line height and the wrap width of a fixed-width
 *   box, if any.
 * @param shaper - Shapes strings into glyphs; its fonts must already be loaded.
 * @param spanShapers - The shaper of each span of the input, in order; a span without one is
 *   shaped with `shaper`.
 * @returns The lines with their glyphs, and the width and height of the text box.
 */
export const layoutText = (
  input: TextLayoutInput,
  shaper: TextShaper,
  spanShapers: readonly TextShaper[] = []
): TextLayout => {
  const { text, fontSize, alignment, lineHeight: lineHeightMultiple, wrapWidth, spans } = input
  const letterSpacing = input.letterSpacing * fontSize
  const metrics = shaper.getPrimaryMetrics()
  const ascent = (metrics.ascender / metrics.unitsPerEm) * fontSize
  const descent = (-metrics.descender / metrics.unitsPerEm) * fontSize
  const lineHeight = fontSize * lineHeightMultiple

  const indent = input.listStyle === 'none' ? 0 : input.listIndent * fontSize
  const textWidth = wrapWidth === undefined ? undefined : Math.max(wrapWidth - indent, 0)
  const paragraphLines = splitParagraphs(text).flatMap((paragraph, paragraphIndex) =>
    breakParagraphIntoLines(
      paragraph,
      { shaper, spans, spanShapers },
      fontSize,
      letterSpacing,
      textWidth
    ).map((line) => ({ ...line, paragraphIndex }))
  )
  const boxWidth = wrapWidth ?? Math.max(0, ...paragraphLines.map((line) => line.width)) + indent
  // Lines align inside the box that is left of the margin.
  const alignWidth = boxWidth - indent

  const lines = paragraphLines.map((line, lineIndex): LaidOutLine => {
    const x = indent + alignmentOffset(alignment, alignWidth, line.width)
    const perSpace = justifyExtraPerSpace(
      line,
      text,
      alignWidth,
      alignment === 'justify' && wrapWidth !== undefined
    )
    const baselineY = getTextBaselineOffset(
      lineIndex,
      fontSize,
      lineHeightMultiple,
      ascent,
      descent
    )
    const marker = line.startsParagraph
      ? getMarker(input.listStyle, line.paragraphIndex)
      : undefined
    return {
      glyphs: [
        ...(marker === undefined ? [] : placeMarker(marker, shaper, line, baselineY, fontSize)),
        ...placeLineGlyphs(line, {
          spans,
          originX: x,
          baselineY,
          fontSize,
          spacing: {
            perGlyph: letterSpacing,
            perSpace,
            isSpace: (cluster) => text[cluster] === SPACE
          }
        })
      ],
      x,
      width: perSpace > 0 ? alignWidth : line.width,
      top: lineIndex * lineHeight,
      baselineY,
      start: line.start,
      end: line.end,
      direction: line.direction
    }
  })
  return { lines, width: boxWidth, height: lines.length * lineHeight, lineHeight }
}
