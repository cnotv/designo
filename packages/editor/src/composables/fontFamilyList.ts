import { loadFontFamilyList } from '@designo/fonts'
import type { FontsourceFamilySummary } from '@designo/storage'
import { computed, readonly, ref, shallowRef } from 'vue'

type FamilyListStatus = 'idle' | 'loading' | 'ready' | 'failed'

// One list for the whole editor, fetched the first time a picker opens and kept for the session.
const status = ref<FamilyListStatus>('idle')
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

/**
 * The font families the picker offers, from the Fontsource API.
 * @returns The families, the load state, and `load`, which fetches the list once and tries again
 * after a failure.
 */
export const useFontFamilyList = () => ({
  // Not `readonly(families)`, which would make every family deeply readonly and so untypeable
  // as the plain objects the editing helpers take.
  families: computed(() => families.value),
  status: readonly(status),
  load
})
