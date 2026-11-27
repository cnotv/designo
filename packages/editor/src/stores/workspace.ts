import { getActivePinia } from 'pinia'
import { useCanvasInteractionStore } from './canvasInteraction.ts'
import { useEditorStore } from './editor.ts'
import { useExportStore } from './export.ts'
import { useFilesStore } from './files.ts'

/**
 * Ends the workspace's stores when the workspace closes, as on a sign-out: their polling, watchers
 * and listeners stop, and their state goes too, because Pinia would otherwise fill the next
 * workspace's stores with it, files of the account that left included.
 */
export const disposeWorkspaceStores = (): void => {
  const pinia = getActivePinia()
  if (!pinia) return
  const stores = [useExportStore(), useCanvasInteractionStore(), useEditorStore(), useFilesStore()]
  const storeIds = new Set<string>(stores.map((store) => store.$id))
  stores.forEach((store) => store.$dispose())
  pinia.state.value = Object.fromEntries(
    Object.entries(pinia.state.value).filter(([storeId]) => !storeIds.has(storeId))
  )
}
