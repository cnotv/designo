<script setup lang="ts">
import { File, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utilities'
import DesignCanvas from './DesignCanvas.vue'
import EditorToolbar from './EditorToolbar.vue'
import LayersPanel from './LayersPanel.vue'
import PagesPanel from './PagesPanel.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import TextEditOverlay from './TextEditOverlay.vue'
import { provideEditorContext } from '../composables/editorContext.ts'
import { useCanvasInteraction } from '../composables/useCanvasInteraction.ts'
import { useDesignoFiles } from '../composables/useDesignoFiles.ts'
import { useEditor } from '../composables/useEditor.ts'
import { measureFallbackTextBox } from '../rendering/fallbackText.ts'
import { getSharedTextRuntime } from '../rendering/text/sharedTextEngine.ts'
import { createTextBoxMeasurer } from '../rendering/text/textBoxMeasurer.ts'
import { useTextBoxFitting } from '../composables/useTextBoxFitting.ts'
import { useExport } from '../composables/useExport.ts'
import { useEditorShortcuts } from '../composables/useEditorShortcuts.ts'
import type { SignedInAccount } from '../editing/types.ts'

const DOCS_SELF_HOSTING_URL = 'https://cnotv.github.io/designo/guides/self-hosting'

defineProps<{ account?: SignedInAccount }>()
const emit = defineEmits<{ accessRefused: []; signOut: [] }>()

const files = useDesignoFiles(() => emit('accessRefused'))
const editor = useEditor(
  files,
  createTextBoxMeasurer(getSharedTextRuntime().engine, measureFallbackTextBox)
)
useTextBoxFitting(files, getSharedTextRuntime().engine)
const interaction = useCanvasInteraction(editor)
const exporter = useExport(editor)
useEditorShortcuts(editor, interaction.spaceHeld, exporter.run)
provideEditorContext({ files, editor, interaction, exporter })

const { documentSummaries, selectedFileId, isDemo, selectFile, deleteFile } = files

const isLeftPanelOpen = ref(true)
const isRightPanelOpen = ref(true)
const gridColumns = computed(
  () => `${isLeftPanelOpen.value ? '240px' : '0px'} 1fr ${isRightPanelOpen.value ? '260px' : '0px'}`
)

const fileToDelete = ref<{ id: string; name: string }>()
const isDeleteOpen = computed({
  get: () => fileToDelete.value !== undefined,
  set: (open: boolean) => {
    if (!open) fileToDelete.value = undefined
  }
})
const confirmDelete = (): void => {
  const target = fileToDelete.value
  fileToDelete.value = undefined
  if (target) void deleteFile(target.id)
}
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
        v-show="isLeftPanelOpen"
        class="bg-background flex min-h-0 flex-col overflow-hidden border-r"
      >
        <nav aria-label="Files" class="flex flex-col gap-0.5 p-1">
          <h2 class="text-muted-foreground px-2 pt-2 pb-1 font-semibold">Files</h2>
          <p v-if="isDemo" class="text-muted-foreground px-2 pb-1">
            No Designo server is behind this page, so it shows a sample.
            <a class="text-primary underline-offset-2 hover:underline" :href="DOCS_SELF_HOSTING_URL"
              >Self-host Designo</a
            >
            to keep files and connect agents.
          </p>
          <p v-else-if="documentSummaries.length === 0" class="text-muted-foreground px-2 pb-1">
            No files yet. Ask an agent to call <code>create_file</code> through the Designo MCP
            server.
          </p>
          <div v-for="summary in documentSummaries" :key="summary.id" class="group flex gap-0.5">
            <Button
              variant="ghost"
              size="xs"
              :class="
                cn(
                  'h-7 min-w-0 flex-1 justify-start font-normal',
                  summary.id === selectedFileId && 'bg-accent'
                )
              "
              :aria-current="summary.id === selectedFileId ? 'page' : undefined"
              @click="selectFile(summary.id)"
            >
              <File class="text-muted-foreground" />
              <span class="truncate">{{ summary.name }}</span>
            </Button>
            <Button
              v-if="!isDemo"
              variant="ghost"
              size="icon-sm"
              class="h-7 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              :aria-label="`Delete ${summary.name}`"
              @click="fileToDelete = { id: summary.id, name: summary.name }"
            >
              <Trash2 />
            </Button>
          </div>
        </nav>
        <Separator />
        <PagesPanel />
        <Separator />
        <LayersPanel />
      </aside>

      <main class="relative min-h-0 min-w-0">
        <DesignCanvas />
        <TextEditOverlay />
      </main>

      <aside v-show="isRightPanelOpen" class="bg-background min-h-0 overflow-y-auto border-l">
        <PropertiesPanel />
      </aside>
    </div>
    <Dialog v-model:open="isDeleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {{ fileToDelete?.name }}?</DialogTitle>
          <DialogDescription>
            The file is removed from the server and cannot be restored.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="fileToDelete = undefined">Cancel</Button>
          <Button variant="destructive" @click="confirmDelete">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </TooltipProvider>
</template>
