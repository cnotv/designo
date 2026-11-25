import { getSpanFace, type TextFace } from '@designo/core'
import type { FontLibrary, TextLayoutRequest } from './types.ts'

/** A face a request draws with, and the part of its text that face draws. */
interface RequestFace {
  face: TextFace
  text: string
}

// The marker is drawn with the node's own font, so its characters need loading with the text.
const getMarkerCharacters = (request: TextLayoutRequest): string => {
  if (request.listStyle === 'bullet') return '•'
  return request.listStyle === 'number' ? '0123456789.' : ''
}

/**
 * The text a request needs fonts for with the node's face, which also draws any list marker.
 * @param request - The text, its fonts and its box.
 * @returns The text and the marker characters.
 */
export const getBaseFaceText = (request: TextLayoutRequest): string =>
  request.text + getMarkerCharacters(request)

/**
 * The face of each span, in the spans' order; the faces differ from the node's only by the weight
 * and style a span sets.
 * @param request - The text, its fonts and its box.
 * @returns One face for each span.
 */
export const getSpanFaces = (request: TextLayoutRequest): TextFace[] =>
  request.spans.map((span) => getSpanFace(request, span))

const getRequestFaces = (request: TextLayoutRequest): RequestFace[] => [
  { face: request, text: getBaseFaceText(request) },
  ...request.spans.map((span, index) => ({
    face: getSpanFaces(request)[index] ?? request,
    text: request.text.slice(span.start, span.end)
  }))
]

/**
 * Looks up the families of the node's face and of every span's, so their registries exist.
 * @param library - The font library.
 * @param request - The text, its fonts and its box.
 */
export const loadRequestFamilies = async (
  library: FontLibrary,
  request: TextLayoutRequest
): Promise<void> => {
  await Promise.all(getRequestFaces(request).map(({ face }) => library.loadFamilies(face)))
}

/**
 * Loads the font files each face needs for its part of the text. The families must be loaded.
 * @param library - The font library.
 * @param request - The text, its fonts and its box.
 */
export const loadRequestFontFiles = async (
  library: FontLibrary,
  request: TextLayoutRequest
): Promise<void> => {
  await Promise.all(
    getRequestFaces(request).map(({ face, text }) =>
      library.getRegistry(face)?.loadFontsForText(text)
    )
  )
}
