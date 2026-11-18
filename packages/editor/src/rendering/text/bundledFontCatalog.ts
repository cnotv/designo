import { BUNDLED_FONT_CATALOG_DATA } from './fontCatalogData.ts'
import { compileFontCatalog } from './fontRegistry.ts'

/** The bundled fonts with their ranges as numbers, built once. */
export const BUNDLED_FONT_CATALOG = compileFontCatalog(BUNDLED_FONT_CATALOG_DATA)
