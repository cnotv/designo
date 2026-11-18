import type { DesignNode } from '@designo/core'
import { pickPrimaryFontId } from './fontFamilyList.ts'
import { isCodePointCovered, splitIntoFontRuns } from './fontRegistry.ts'
import { createPreferredFontRegistry } from './preferredFontRegistry.ts'
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

const neededFontIds = (view: FontRegistry, text: string): string[] => [
  ...new Set([
    view.catalog.defaultFontId,
    ...splitIntoFontRuns(text, view.catalog).map((run) => run.fontId)
  ])
]

const hasUncoveredCharacter = (view: FontRegistry, text: string): boolean =>
  [...text].some((character) => {
    return (
      !IGNORED_CHARACTER_PATTERN.test(character) &&
      !isCodePointCovered(view.catalog, character.codePointAt(0) ?? 0)
    )
  })

const isWebAssemblyDefined = (): boolean => typeof WebAssembly === 'object'

/**
 * Makes the engine that turns a text node into laid-out glyphs for the renderers and the editor.
 * It picks the font from the node's family list, loads fonts on demand and keeps each layout, so
 * panning and zooming never shape again. Anything it cannot do yet or at all (fonts still
 * loading, a character no bundled font draws, no WebAssembly) it reports as undefined, and the
 * caller draws that text the Canvas 2D way.
 * @param options - The font registry, and for tests whether shaping is available and the cache size.
 * @returns The engine.
 */
export const createTextEngine = ({
  registry,
  isShapingAvailable = isWebAssemblyDefined,
  layoutLimit = DEFAULT_LAYOUT_LIMIT
}: TextEngineOptions): TextEngine => {
  const layouts = new Map<string, TextLayout>()
  const nodeLayouts = new WeakMap<DesignNode, TextLayout>()
  const views = new Map<string, { view: FontRegistry; shaper: TextShaper }>()
  const pendingLoads = new Set<string>()
  const failedLoads = new Set<string>()
  const finishedLoads = new Set<string>()
  const listeners = new Set<() => void>()

  const getView = (fontFamily: string) => {
    const fontId = pickPrimaryFontId(fontFamily, registry.catalog)
    const existing = views.get(fontId)
    if (existing) return existing
    const view = createPreferredFontRegistry(registry, fontId)
    const created = { view, shaper: createTextShaper(view) }
    views.set(fontId, created)
    return created
  }

  const notify = (): void => listeners.forEach((listener) => listener())

  const startLoading = (key: string, view: FontRegistry, text: string): void => {
    if (pendingLoads.has(key) || failedLoads.has(key)) return
    pendingLoads.add(key)
    view
      .loadFontsForText(text)
      .then(() => {
        finishedLoads.add(key)
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
    const { view, shaper } = getView(request.fontFamily)
    if (hasUncoveredCharacter(view, request.text)) return undefined
    if (!neededFontIds(view, request.text).every((fontId) => view.getFont(fontId))) return undefined
    const layout = layoutText(request, shaper)
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
    const { view } = getView(request.fontFamily)
    if (!hasUncoveredCharacter(view, request.text)) startLoading(key, view, request.text)
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
