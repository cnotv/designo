import { loadFontFamilyList } from '@designo/fonts'
import type { FontsourceFamilySummary } from '@designo/storage'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

type FamilyListStatus = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * The font families the picker offers, from the Fontsource API: one list for the whole editor,
 * fetched the first time a picker opens and kept for the session. `load` fetches it once and
 * tries again after a failure.
 */
export const useFontFamilyListStore = defineStore('fontFamilyList', () => {
  const status = ref<FamilyListStatus>('idle')
  // Shallow, so the families stay the plain objects the editing helpers take.
  const families = shallowRef<readonly FontsourceFamilySummary[]>([])

  const load = async (): Promise<void> => {
    if (status.value === 'loading' || status.value === 'ready') return
    status.value = 'loading'
    try {
      families.value = await loadFontFamilyList((url) => fetch(url))
      status.value = 'ready'
    } catch (error) {
      console.warn('Designo: the font list did not load', error)
      status.value = 'failed'
    }
  }

  return { families, status, load }
})
