import { loadRequestFamilies, loadRequestFontFiles } from './requestFaces.ts'
import type { TextLayout, TextLayoutRequest, TextRuntime } from './types.ts'

/**
 * Lays a text out once its fonts have loaded, where `TextEngine.getLayout` answers right away
 * and leaves the loading to the caller. For code that wants the answer and has no canvas to
 * draw again: the MCP server measuring and wrapping text.
 * @param runtime - The font library and the engine over it.
 * @param request - The text, its fonts and its box.
 * @returns The layout, or undefined when the font API lacks its families or a character has no font.
 */
export const loadTextLayout = async (
  { library, engine }: TextRuntime,
  request: TextLayoutRequest
): Promise<TextLayout | undefined> => {
  try {
    await loadRequestFamilies(library, request)
    await loadRequestFontFiles(library, request)
  } catch {
    return undefined
  }
  return engine.peekLayout(request)
}
