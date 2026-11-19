import type * as HarfBuzz from 'harfbuzzjs'
import type { GlyphExtents, ShapedGlyph, ShapingFont, TextDirection } from './types.ts'

interface HarfBuzzRuntime {
  api: typeof HarfBuzz
  /** One buffer, reset after every shape: shaping is synchronous, so it is never shared at once. */
  buffer: HarfBuzz.Buffer
}

const runtimeCell: { pending?: Promise<HarfBuzzRuntime> } = {}

/**
 * Loads the official HarfBuzz WebAssembly build the first time it is asked for, so pages without
 * text never download it. Vite emits the .wasm file as an asset and Node reads it from disk.
 * @returns The HarfBuzz API and a shared buffer.
 */
const loadHarfBuzz = (): Promise<HarfBuzzRuntime> => {
  runtimeCell.pending ??= import('harfbuzzjs').then((api) => ({ api, buffer: new api.Buffer() }))
  return runtimeCell.pending
}

const toHarfBuzzDirection = (api: typeof HarfBuzz, direction: TextDirection) =>
  direction === 'rtl' ? api.Direction.RTL : api.Direction.LTR

const toGlyphExtents = (extents: HarfBuzz.GlyphExtents | undefined): GlyphExtents | undefined =>
  extents && {
    xBearing: extents.xBearing,
    yBearing: extents.yBearing,
    width: extents.width,
    height: extents.height
  }

const shapeWithBuffer = (
  { api, buffer }: HarfBuzzRuntime,
  font: HarfBuzz.Font,
  text: string,
  direction: TextDirection
): ShapedGlyph[] => {
  buffer.reset()
  buffer.addText(text)
  buffer.setDirection(toHarfBuzzDirection(api, direction))
  // The script and language come from the text; the direction is the caller's, from bidi.
  buffer.guessSegmentProperties()
  api.shape(font, buffer)
  const infos = buffer.getGlyphInfos()
  const positions = buffer.getGlyphPositions()
  buffer.reset()
  return infos.map((info, index) => ({
    glyphId: info.codepoint,
    cluster: info.cluster,
    xAdvance: positions[index]?.xAdvance ?? 0,
    yAdvance: positions[index]?.yAdvance ?? 0,
    xOffset: positions[index]?.xOffset ?? 0,
    yOffset: positions[index]?.yOffset ?? 0
  }))
}

/**
 * Opens a font file in HarfBuzz, loading HarfBuzz itself on first use. Shaping runs in font
 * units, so one shaping serves every font size and zoom.
 * @param bytes - A raw sfnt file (TrueType or OpenType); HarfBuzz does not read WOFF2.
 * @returns The font, ready to shape with.
 */
export const createHarfBuzzShapingFont = async (bytes: Uint8Array): Promise<ShapingFont> => {
  const runtime = await loadHarfBuzz()
  const face = new runtime.api.Face(new runtime.api.Blob(bytes))
  const font = new runtime.api.Font(face)
  const { ascender, descender } = font.hExtents()
  return {
    metrics: { unitsPerEm: face.upem, ascender, descender },
    shape: (text, direction) => shapeWithBuffer(runtime, font, text, direction),
    hasGlyph: (codePoint) => font.nominalGlyph(codePoint) !== undefined,
    getGlyphOutline: (glyphId) => ({
      pathData: font.glyphToPath(glyphId),
      extents: toGlyphExtents(font.glyphExtents(glyphId))
    })
  }
}
