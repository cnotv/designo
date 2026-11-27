import { watch } from 'vue'
import { screenToWorld } from '../editing/viewport.ts'
import type { Viewport } from '../editing/types.ts'
import type { DesignoFiles } from './types.ts'

// The pointer is shared at most this often, which is smooth to watch and light on the network.
const CURSOR_SHARE_INTERVAL_MILLISECONDS = 50

/**
 * Shares this tab's selection and pointer with the others on the file.
 * @param editor - The editor store, where the selection and the view come from.
 * @param files - Where the presence goes.
 * @returns Handlers for the canvas: one for pointer moves, one for the pointer leaving it.
 */
export const usePresenceSharing = (
  editor: { readonly selection: readonly string[]; readonly viewport: Viewport },
  files: Pick<DesignoFiles, 'updatePresence'>
): { shareCursor: (event: PointerEvent) => void; hideCursor: () => void } => {
  let lastShare = 0
  watch(
    () => editor.selection,
    (selection) => files.updatePresence({ selection: [...selection] }),
    { immediate: true }
  )
  return {
    shareCursor: (event) => {
      const now = performance.now()
      if (now - lastShare < CURSOR_SHARE_INTERVAL_MILLISECONDS) return
      lastShare = now
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
      files.updatePresence({
        cursor: screenToWorld(editor.viewport, {
          x: event.clientX - box.left,
          y: event.clientY - box.top
        })
      })
    },
    hideCursor: () => files.updatePresence({ cursor: null })
  }
}
