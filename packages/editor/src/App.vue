<script setup lang="ts">
import { File } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utilities'
import DesignCanvas from './components/DesignCanvas.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import LayersPanel from './components/LayersPanel.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import TextEditOverlay from './components/TextEditOverlay.vue'
import { provideEditorContext } from './composables/editorContext.ts'
import { useCanvasInteraction } from './composables/useCanvasInteraction.ts'
import { useDesignoFiles } from './composables/useDesignoFiles.ts'
import { useEditor } from './composables/useEditor.ts'
import { useExport } from './composables/useExport.ts'
import { useEditorShortcuts } from './composables/useEditorShortcuts.ts'

const DOCS_SELF_HOSTING_URL = 'https://cnotv.github.io/designo/guides/self-hosting'

const files = useDesignoFiles()
const editor = useEditor(files)
const interaction = useCanvasInteraction(editor)
const exporter = useExport(editor)
useEditorShortcuts(editor, interaction.spaceHeld, exporter.run)
provideEditorContext({ files, editor, interaction, exporter })

const { documentSummaries, selectedFileId, isDemo, selectFile } = files
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <div class="grid h-screen grid-cols-[240px_1fr_260px] grid-rows-[auto_1fr] overflow-hidden">
      <EditorToolbar class="col-span-3" />

      <aside class="bg-background flex min-h-0 flex-col border-r">
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
          <Button
            v-for="summary in documentSummaries"
            :key="summary.id"
            variant="ghost"
            size="xs"
            :class="
              cn('h-7 justify-start font-normal', summary.id === selectedFileId && 'bg-accent')
            "
            :aria-current="summary.id === selectedFileId ? 'page' : undefined"
            @click="selectFile(summary.id)"
          >
            <File class="text-muted-foreground" />
            <span class="truncate">{{ summary.name }}</span>
          </Button>
        </nav>
        <Separator />
        <LayersPanel />
      </aside>

      <main class="relative min-h-0 min-w-0">
        <DesignCanvas />
        <TextEditOverlay />
      </main>

      <aside class="bg-background min-h-0 overflow-y-auto border-l">
        <PropertiesPanel />
      </aside>
    </div>
  </TooltipProvider>
</template>
