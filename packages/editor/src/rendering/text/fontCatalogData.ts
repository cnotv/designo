import type { FontCatalogData } from './types.ts'

// Space, digits and punctuation sit between letters of any language, so every script font claims
// them and a run of Arabic keeps its numbers and spaces in the Arabic font.
const NEUTRAL_RANGES = ['U+0020-0040', 'U+005B-0060', 'U+007B-007E', 'U+00A0']

/**
 * The fonts the editor ships. Inter covers Latin, Greek and Cyrillic. Gelasio is a serif for Latin and the stand-in for Georgia. The Noto Sans subsets cover
 * the scripts Inter lacks and load only when a text uses them. The ranges are what each file was
 * subset to, and a test checks the files map nothing outside them.
 */
export const BUNDLED_FONT_CATALOG_DATA: FontCatalogData = {
  defaultFontId: 'inter',
  fonts: [
    {
      id: 'inter',
      family: 'Inter',
      url: 'fonts/Inter-Regular.subset.ttf',
      coverage: [
        'U+0020-007E',
        'U+00A0-024F',
        'U+0300-036F',
        'U+0370-03FF',
        'U+0400-052F',
        'U+1E00-1EFF',
        'U+2000-206F',
        'U+20A0-20CF',
        'U+2116',
        'U+2122',
        'U+2190-2199',
        'U+2212',
        'U+2215',
        'U+2260-2265',
        'U+25CC'
      ]
    },
    {
      id: 'gelasio',
      family: 'Gelasio',
      url: 'fonts/Gelasio-Regular.subset.ttf',
      coverage: [
        'U+0020-007E',
        'U+00A0-024F',
        'U+0300-036F',
        'U+1E00-1EFF',
        'U+2000-206F',
        'U+20A0-20CF',
        'U+2116',
        'U+2122',
        'U+2190-2199',
        'U+2212',
        'U+2215',
        'U+2260-2265',
        'U+25CC'
      ]
    },
    {
      id: 'noto-sans-arabic',
      family: 'Noto Sans Arabic',
      url: 'fonts/NotoSansArabic-Regular.subset.ttf',
      coverage: [
        ...NEUTRAL_RANGES,
        'U+00AB',
        'U+00BB',
        'U+0600-06FF',
        'U+0750-077F',
        'U+08A0-08FF',
        'U+200C-200F',
        'U+202A-202E',
        'U+2066-2069',
        'U+25CC',
        'U+FB50-FDFF',
        'U+FE70-FEFF'
      ]
    },
    {
      id: 'noto-sans-hebrew',
      family: 'Noto Sans Hebrew',
      url: 'fonts/NotoSansHebrew-Regular.subset.ttf',
      coverage: [
        ...NEUTRAL_RANGES,
        'U+0590-05FF',
        'U+200C-200F',
        'U+202A-202E',
        'U+2066-2069',
        'U+25CC',
        'U+FB1D-FB4F'
      ]
    },
    {
      id: 'noto-sans-devanagari',
      family: 'Noto Sans Devanagari',
      url: 'fonts/NotoSansDevanagari-Regular.subset.ttf',
      coverage: [
        ...NEUTRAL_RANGES,
        'U+0900-097F',
        'U+1CD0-1CFF',
        'U+200C-200D',
        'U+20B9',
        'U+25CC',
        'U+A8E0-A8FF'
      ]
    }
  ]
}
