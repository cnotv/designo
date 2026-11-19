import { toFaceKey } from '@designo/core'
import { resolveFontFamilies, type FontFamilyFiles } from '@designo/fonts'
import { compileFontCatalog, createFontRegistry } from './fontRegistry.ts'
import type { TextFace } from '@designo/core'
import type { FontCatalog, FontLibrary, FontLibraryOptions, FontRegistry } from './types.ts'

/**
 * Makes the catalog for the families a list resolved to: every file of the first family, which
 * draws the text, then the files of the others for the characters it lacks.
 * @param families - The families found, preferred first.
 * @returns The catalog, its default the first family's Latin file; undefined when none was found.
 */
export const toFontCatalog = (families: readonly FontFamilyFiles[]): FontCatalog | undefined => {
  const files = [
    ...new Map(families.flatMap((family) => family.files).map((file) => [file.id, file])).values()
  ]
  const first = files[0]
  if (!first) return undefined
  return compileFontCatalog({
    defaultFontId: first.id,
    fonts: files.map(({ id, family, url, coverage, fontWeight, fontStyle }) => ({
      id,
      family,
      url,
      coverage,
      fontWeight,
      fontStyle
    }))
  })
}

/**
 * Makes the library the text engine asks for fonts. A family list is looked up once, through the
 * font API, and becomes a registry over the shared store, so a file two lists use loads once.
 * @param options - The family lookup and the store of loaded files.
 * @returns The library, with no family looked up yet.
 */
export const createFontLibrary = ({ resolveFamily, store }: FontLibraryOptions): FontLibrary => {
  const registries = new Map<string, FontRegistry>()
  const loading = new Map<string, Promise<void>>()

  const loadFamilies = (face: TextFace): Promise<void> => {
    const key = toFaceKey(face)
    if (registries.has(key)) return Promise.resolve()
    const pending = loading.get(key)
    if (pending) return pending
    const lookup = resolveFontFamilies(face, resolveFamily)
      .then((families) => {
        const catalog = toFontCatalog(families)
        if (!catalog) {
          throw new Error(`The font API has none of the families in ${face.fontFamily}`)
        }
        registries.set(key, createFontRegistry({ catalog, store }))
      })
      .finally(() => {
        loading.delete(key)
      })
    loading.set(key, lookup)
    return lookup
  }

  return {
    getRegistry: (face) => registries.get(toFaceKey(face)),
    loadFamilies,
    getFont: store.getFont
  }
}
