<script setup lang="ts">
import { storeToRefs } from 'pinia'
import {
  ChevronDown,
  Circle,
  Frame,
  Github,
  ImagePlus,
  Maximize,
  Minus,
  MousePointer2,
  Pentagon,
  PenTool,
  PanelLeft,
  PanelRight,
  Redo2,
  Square,
  Type,
  Undo2
} from 'lucide-vue-next'
import { computed, ref, useTemplateRef, watch, type Component } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEditorStore } from '../stores/editor.ts'
import { useFilesStore } from '../stores/files.ts'
import { useImageInsertion } from '../composables/useImageInsertion.ts'
import type { SignedInAccount, Tool } from '../editing/types.ts'
import AccountMenu from './AccountMenu.vue'

defineProps<{ account?: SignedInAccount }>()
const emit = defineEmits<{ signOut: []; accessRefused: [] }>()
const isLeftPanelOpen = defineModel<boolean>('leftPanelOpen', { required: true })
const isRightPanelOpen = defineModel<boolean>('rightPanelOpen', { required: true })

const editor = useEditorStore()
const files = useFilesStore()
const { isDemo, saveError } = storeToRefs(files)

const PERCENT = 100
const REPOSITORY_URL = 'https://github.com/cnotv/designo'
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

const { insertImageFile } = useImageInsertion(editor, files)
const imageInput = useTemplateRef<HTMLInputElement>('imageInput')

const onImageChosen = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const [file] = input.files ?? []
  // Cleared so the same file can be chosen again after it is removed.
  input.value = ''
  if (file) void insertImageFile(file)
}

interface ToolEntry {
  tool: Tool
  label: string
  shortcut: string
  icon: Component
}

const moveTools: ToolEntry[] = [
  { tool: 'select', label: 'Move', shortcut: 'V', icon: MousePointer2 },
  { tool: 'frame', label: 'Frame', shortcut: 'F', icon: Frame }
]

// Shapes share one button with a menu, so the bar stays short as drawing tools are added.
const shapeTools: ToolEntry[] = [
  { tool: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: Square },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: Circle },
  { tool: 'line', label: 'Line', shortcut: 'L', icon: Minus },
  { tool: 'pen', label: 'Pen', shortcut: 'P', icon: PenTool },
  { tool: 'polygon', label: 'Polygon', shortcut: 'Y', icon: Pentagon }
]

const textTools: ToolEntry[] = [{ tool: 'text', label: 'Text', shortcut: 'T', icon: Type }]

const tools = [...moveTools, ...shapeTools, ...textTools]

// The button shows the shape drawn last, as drawing apps do, so repeating it is one click.
const lastShape = ref(shapeTools[0])
watch(
  () => editor.tool,
  (tool) => {
    lastShape.value = shapeTools.find((entry) => entry.tool === tool) ?? lastShape.value
  }
)
const isShapeToolActive = computed(() => shapeTools.some((entry) => entry.tool === editor.tool))

const isTool = (value: unknown): value is Tool => tools.some((entry) => entry.tool === value)

const selectedTool = computed({
  get: () => editor.tool,
  set: (value: unknown) => {
    if (isTool(value)) editor.setTool(value)
  }
})

const zoomLabel = computed(() => `${Math.round(editor.viewport.scale * PERCENT)}%`)
</script>

<template>
  <header class="bg-background flex h-11 items-center gap-2 border-b px-2">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle left panel"
          :aria-pressed="isLeftPanelOpen"
          @click="isLeftPanelOpen = !isLeftPanelOpen"
        >
          <PanelLeft />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ isLeftPanelOpen ? 'Hide' : 'Show' }} left panel</TooltipContent>
    </Tooltip>
    <span class="px-2 text-sm font-semibold">Designo</span>
    <Separator orientation="vertical" class="h-6!" />
    <ToggleGroup v-model="selectedTool" type="single" size="sm" aria-label="Tools">
      <Tooltip v-for="entry in moveTools" :key="entry.tool">
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
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          variant="ghost"
          size="sm"
          class="gap-0.5 px-1.5"
          aria-label="Shapes"
          :aria-pressed="isShapeToolActive"
          :class="{ 'bg-accent': isShapeToolActive }"
        >
          <component :is="lastShape?.icon" />
          <ChevronDown class="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          v-for="entry in shapeTools"
          :key="entry.tool"
          @select="editor.setTool(entry.tool)"
        >
          <component :is="entry.icon" />
          {{ entry.label }}
          <DropdownMenuShortcut>{{ entry.shortcut }}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ToggleGroup v-model="selectedTool" type="single" size="sm" aria-label="Text tool">
      <Tooltip v-for="entry in textTools" :key="entry.tool">
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
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Add image"
          :disabled="isDemo"
          @click="imageInput?.click()"
        >
          <ImagePlus />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ isDemo ? 'Images need the Designo server' : 'Add image' }}</TooltipContent>
    </Tooltip>
    <input
      ref="imageInput"
      type="file"
      class="hidden"
      :accept="IMAGE_TYPES"
      aria-label="Image file"
      @change="onImageChosen"
    />
    <Separator orientation="vertical" class="h-6!" />
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          :disabled="!editor.canUndo"
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
          :disabled="!editor.canRedo"
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
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="ghost" size="icon-sm" as-child>
            <a
              :href="REPOSITORY_URL"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Designo on GitHub"
            >
              <Github />
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Designo on GitHub</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle right panel"
            :aria-pressed="isRightPanelOpen"
            @click="isRightPanelOpen = !isRightPanelOpen"
          >
            <PanelRight />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ isRightPanelOpen ? 'Hide' : 'Show' }} right panel</TooltipContent>
      </Tooltip>
      <AccountMenu
        v-if="account"
        :account="account"
        @sign-out="emit('signOut')"
        @access-refused="emit('accessRefused')"
      />
    </div>
  </header>
</template>
