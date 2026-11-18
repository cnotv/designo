import type { DesignNode } from '@designo/core'
import { isCodePointCovered, splitIntoFontRuns } from './fontRegistry.ts'
import { layoutText } from './textLayout.ts'
import { createTextShaper } from './textShaper.ts'
import { toTextLayoutRequest } from './textLayoutRequest.ts'
import type {
  FontRegistry,
  TextEngine,
  TextEngineOptions,
  TextLayout,
  TextLayoutRequest,
  TextShaper
} from './types.ts'

const DEFAULT_LAYOUT_LIMIT = 20_000
// Line breaks and tabs are layout, not glyphs, and variation selectors only modify the character
// before them, so none of them sends a text to the fallback.
const IGNORED_CHARACTER_PATTERN = /^[\t\n\r\p{Zl}\p{Zp}\p{Variation_Selector}]$/u

const layoutKey = (request: TextLayoutRequest): string =>
  JSON.stringify([
    request.text,
    request.fontFamily,
    request.fontSize,
    request.lineHeight,
    request.alignment,
    request.wrapWidth ?? null
  ])

const neededFontIds = (registry: FontRegistry, text: string): string[] => [
  ...new Set([
    registry.catalog.defaultFontId,
    ...splitIntoFontRuns(text, registry.catalog, registry.getFont).map((run) => run.fontId)
  ])
]

const hasUncoveredCharacter = (registry: FontRegistry, text: string): boolean =>
  [...text].some((character) => {
    return (
      !IGNORED_CHARACTER_PATTERN.test(character) &&
      !isCodePointCovered(registry.catalog, character.codePointAt(0) ?? 0, registry.getFont)
    )
  })

const isWebAssemblyDefined = (): boolean => typeof WebAssembly === 'object'

/**
 * Makes the engine that turns a text node into laid-out glyphs for the renderers and the editor.
 * It finds the node's families through the font library, loads their files on demand and keeps
 * each layout, so panning and zooming never shape again. Anything it cannot do yet or at all
 * (fonts still loading, a family the font API lacks, a character none of the fonts draws, no
 * WebAssembly) it reports as undefined, and the caller draws that text the Canvas 2D way.
 * @param options - The font library, and for tests whether shaping is available and the cache size.
 * @returns The engine.
 */
export const createTextEngine = ({
  library,
  isShapingAvailable = isWebAssemblyDefined,
  layoutLimit = DEFAULT_LAYOUT_LIMIT
}: TextEngineOptions): TextEngine => {
  const layouts = new Map<string, TextLayout>()
  const nodeLayouts = new WeakMap<DesignNode, TextLayout>()
  const shapers = new WeakMap<FontRegistry, TextShaper>()
  const pendingLoads = new Set<string>()
  const failedLoads = new Set<string>()
  const finishedLoads = new Set<string>()
  const listeners = new Set<() => void>()

  const getShaper = (registry: FontRegistry): TextShaper => {
    const known = shapers.get(registry)
    if (known) return known
    const shaper = createTextShaper(registry)
    shapers.set(registry, shaper)
    return shaper
  }

  const notify = (): void => listeners.forEach((listener) => listener())

  const loadFonts = async (request: TextLayoutRequest): Promise<boolean> => {
    await library.loadFamilies(request.fontFamily)
    const registry = library.getRegistry(request.fontFamily)
    // A character none of the fonts draws stays with the browser, which may have a font for it.
    if (!registry || hasUncoveredCharacter(registry, request.text)) return false
    await registry.loadFontsForText(request.text)
    return true
  }

  const startLoading = (key: string, request: TextLayoutRequest): void => {
    if (pendingLoads.has(key) || failedLoads.has(key)) return
    pendingLoads.add(key)
    loadFonts(request)
      .then((loaded) => {
        const outcomes = loaded ? finishedLoads : failedLoads
        outcomes.add(key)
      })
      .catch((error: unknown) => {
        failedLoads.add(key)
        console.warn('Designo: a font for text did not load, so it is drawn by the browser', error)
      })
      .finally(() => {
        pendingLoads.delete(key)
        notify()
      })
  }

  const remember = (key: string, layout: TextLayout): void => {
    layouts.set(key, layout)
    if (layouts.size <= layoutLimit) return
    const oldest = layouts.keys().next().value
    if (oldest !== undefined) layouts.delete(oldest)
  }

  const computeLayout = (request: TextLayoutRequest, key: string): TextLayout | undefined => {
    const registry = library.getRegistry(request.fontFamily)
    if (!registry || hasUncoveredCharacter(registry, request.text)) return undefined
    if (!neededFontIds(registry, request.text).every((fontId) => registry.getFont(fontId))) {
      return undefined
    }
    const layout = layoutText(request, getShaper(registry))
    remember(key, layout)
    return layout
  }

  const findLayout = (request: TextLayoutRequest, shouldLoad: boolean): TextLayout | undefined => {
    if (!isShapingAvailable()) return undefined
    const key = layoutKey(request)
    const cached = layouts.get(key)
    if (cached) return cached
    if (pendingLoads.has(key) || failedLoads.has(key)) return undefined
    const layout = computeLayout(request, key)
    if (layout || !shouldLoad) return layout
    // Loaded and still not laid out would ask again every frame, so it stays on the fallback.
    if (finishedLoads.has(key)) failedLoads.add(key)
    startLoading(key, request)
    return undefined
  }

  return {
    getLayout: (request) => findLayout(request, true),
    peekLayout: (request) => findLayout(request, false),
    getNodeLayout: (node) => {
      const known = nodeLayouts.get(node)
      if (known) return known
      const layout = findLayout(toTextLayoutRequest(node), true)
      if (layout) nodeLayouts.set(node, layout)
      return layout
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
