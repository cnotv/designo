<script setup lang="ts">
import { presenceColor } from '@designo/sync'
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utilities'
import DesignCanvas from './DesignCanvas.vue'
import EditorToolbar from './EditorToolbar.vue'
import FilesPanel from './FilesPanel.vue'
import LayersPanel from './LayersPanel.vue'
import PagesPanel from './PagesPanel.vue'
import StylesPanel from './StylesPanel.vue'
import CommentsPanel from './CommentsPanel.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import TextEditOverlay from './TextEditOverlay.vue'
import { useEditorShortcuts } from '../composables/useEditorShortcuts.ts'
import { useCanvasInteractionStore } from '../stores/canvasInteraction.ts'
import { useEditorStore } from '../stores/editor.ts'
import { useExportStore } from '../stores/export.ts'
import { useFilesStore } from '../stores/files.ts'
import { disposeWorkspaceStores } from '../stores/workspace.ts'
import type { SignedInAccount } from '../editing/types.ts'

const props = defineProps<{ account?: SignedInAccount }>()
const emit = defineEmits<{ accessRefused: []; signOut: [] }>()

const files = useFilesStore()
const editor = useEditorStore()
const interaction = useCanvasInteractionStore()
const exporter = useExportStore()
useEditorShortcuts(editor, toRef(interaction, 'spaceHeld'), exporter.run)
watch(
  () => files.accessRefused,
  (refused) => {
    if (refused) emit('accessRefused')
  }
)
onBeforeUnmount(disposeWorkspaceStores)
// A signed-in person is shown to the others by name; a visitor keeps the guest name made for the tab.
watch(
  () => props.account?.name,
  (name) => {
    if (name) files.updatePresence({ user: { name, color: presenceColor(name), kind: 'person' } })
  },
  { immediate: true }
)

const isLeftPanelOpen = ref(true)
const isRightPanelOpen = ref(true)
const gridColumns = computed(
  () => `${isLeftPanelOpen.value ? '240px' : '0px'} 1fr ${isRightPanelOpen.value ? '260px' : '0px'}`
)
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <div
      class="grid h-screen grid-rows-[auto_1fr] overflow-hidden"
      :style="{ gridTemplateColumns: gridColumns }"
    >
      <EditorToolbar
        class="col-span-3"
        v-model:left-panel-open="isLeftPanelOpen"
        v-model:right-panel-open="isRightPanelOpen"
        :account="account"
        @sign-out="emit('signOut')"
        @access-refused="emit('accessRefused')"
      />

      <aside
        :class="
          cn(
            'bg-background flex min-h-0 min-w-0 flex-col overflow-hidden border-r',
            !isLeftPanelOpen && 'invisible'
          )
        "
      >
        <FilesPanel />
        <Separator />
        <PagesPanel />
        <Separator />
        <LayersPanel />
        <Separator />
        <StylesPanel />
        <Separator />
        <CommentsPanel />
      </aside>

      <main class="relative min-h-0 min-w-0">
        <DesignCanvas />
        <TextEditOverlay />
      </main>

      <aside
        :class="
          cn(
            'bg-background min-h-0 min-w-0 overflow-x-hidden overflow-y-auto border-l',
            !isRightPanelOpen && 'invisible'
          )
        "
      >
        <PropertiesPanel />
      </aside>
    </div>
  </TooltipProvider>
</template>
