import { createBundledFontRegistry } from './bundledFontRegistry.ts'
import { createTextEngine } from './textEngine.ts'
import type { TextRuntime } from './types.ts'

const runtimeCell: { runtime?: TextRuntime } = {}

/**
 * The fonts and the text engine the whole editor shares, made on first use: the canvas draws with
 * them and the editor measures text with them, so a font loads once and a text is shaped once.
 * @returns The registry and the engine over it.
 */
export const getSharedTextRuntime = (): TextRuntime => {
  if (runtimeCell.runtime) return runtimeCell.runtime
  const registry = createBundledFontRegistry()
  const runtime = { registry, engine: createTextEngine({ registry }) }
  runtimeCell.runtime = runtime
  return runtime
}
