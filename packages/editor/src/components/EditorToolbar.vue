<script setup lang="ts">
import { Circle, Frame, Maximize, MousePointer2, Redo2, Square, Type, Undo2 } from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEditorContext } from '../composables/editorContext.ts'
import type { Tool } from '../editing/types.ts'

const { editor, files } = useEditorContext()
const { isDemo, saveError } = files

const PERCENT = 100

const tools: { tool: Tool; label: string; shortcut: string; icon: Component }[] = [
  { tool: 'select', label: 'Move', shortcut: 'V', icon: MousePointer2 },
  { tool: 'frame', label: 'Frame', shortcut: 'F', icon: Frame },
  { tool: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: Square },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { tool: 'text', label: 'Text', shortcut: 'T', icon: Type }
]

const isTool = (value: unknown): value is Tool => tools.some((entry) => entry.tool === value)

const selectedTool = computed({
  get: () => editor.tool.value,
  set: (value: unknown) => {
    if (isTool(value)) editor.setTool(value)
  }
})

const zoomLabel = computed(() => `${Math.round(editor.viewport.value.scale * PERCENT)}%`)
</script>

<template>
  <header class="bg-background flex h-11 items-center gap-2 border-b px-2">
    <span class="px-2 text-sm font-semibold">Designo</span>
    <Separator orientation="vertical" class="h-6!" />
    <ToggleGroup v-model="selectedTool" type="single" size="sm" aria-label="Tools">
      <Tooltip v-for="entry in tools" :key="entry.tool">
        <TooltipTrigger as-child>
          <ToggleGroupItem :value="entry.tool" :aria-label="entry.label">
            <component :is="entry.icon" />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>
          {{ entry.label }} <Kbd>{{ entry.shortcut }}</Kbd>
        </TooltipContent>
      </Tooltip>
    </ToggleGroup>
    <Separator orientation="vertical" class="h-6!" />
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          :disabled="!editor.canUndo.value"
          @click="editor.undo"
        >
          <Undo2 />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Undo <Kbd>Ctrl Z</Kbd></TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Redo"
          :disabled="!editor.canRedo.value"
          @click="editor.redo"
        >
          <Redo2 />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Redo <Kbd>Shift Ctrl Z</Kbd></TooltipContent>
    </Tooltip>
    <div class="ml-auto flex items-center gap-2">
      <span v-if="saveError" class="text-destructive" role="alert">{{ saveError }}</span>
      <span v-else-if="isDemo" class="text-muted-foreground">Demo: edits stay in this tab</span>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="sm" aria-label="Zoom to fit" @click="editor.zoomToFit">
            <Maximize />
            <span class="tabular-nums">{{ zoomLabel }}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom to fit <Kbd>Shift 1</Kbd></TooltipContent>
      </Tooltip>
    </div>
  </header>
</template>
