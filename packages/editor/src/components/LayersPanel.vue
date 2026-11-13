<script setup lang="ts">
import type { DesignNodeType } from '@designo/core'
import { Circle, Eye, EyeOff, Frame, Group, Square, Type } from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utilities'
import EditorContextMenu from './EditorContextMenu.vue'
import { useEditorContext } from '../composables/editorContext.ts'
import { getLayerRows } from '../editing/layers.ts'
import { toggleInSelection } from '../editing/selection.ts'

const { editor } = useEditorContext()

const INDENT_PIXELS = 12
const BASE_PADDING_PIXELS = 8

const ICON_BY_TYPE: Record<DesignNodeType, Component> = {
  page: Frame,
  frame: Frame,
  group: Group,
  rectangle: Square,
  ellipse: Circle,
  text: Type
}

const rows = computed(() => (editor.document.value ? getLayerRows(editor.document.value) : []))

// A right-click acts on the layer under it, unless it is already part of the selection.
const selectForMenu = (nodeId: string): void => {
  if (!editor.selection.value.includes(nodeId)) editor.select([nodeId])
}

const selectLayer = (nodeId: string, event: MouseEvent): void => {
  editor.select(event.shiftKey ? toggleInSelection(editor.selection.value, nodeId) : [nodeId])
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col" aria-label="Layers">
    <h2 class="text-muted-foreground px-3 pt-3 pb-1 font-semibold">Layers</h2>
    <ScrollArea class="min-h-0 flex-1">
      <p v-if="rows.length === 0" class="text-muted-foreground px-3 py-2">
        Draw with the toolbar, or ask an agent through the MCP server.
      </p>
      <ul class="px-1 pb-2">
        <EditorContextMenu v-for="{ node, depth } in rows" :key="node.id">
          <li class="group flex items-center" @contextmenu="selectForMenu(node.id)">
            <Button
              variant="ghost"
              size="xs"
              :class="
                cn(
                  'h-7 flex-1 justify-start font-normal',
                  editor.selection.value.includes(node.id) && 'bg-primary/15 hover:bg-primary/20',
                  !node.visible && 'text-muted-foreground'
                )
              "
              :style="{ paddingLeft: `${BASE_PADDING_PIXELS + depth * INDENT_PIXELS}px` }"
              :aria-pressed="editor.selection.value.includes(node.id)"
              @click="selectLayer(node.id, $event)"
            >
              <component :is="ICON_BY_TYPE[node.type]" class="text-muted-foreground" />
              <span class="truncate">{{ node.name || node.type }}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              :class="!node.visible && 'opacity-100'"
              :aria-label="node.visible ? `Hide ${node.name}` : `Show ${node.name}`"
              @click="editor.updateNode(node.id, { visible: !node.visible })"
            >
              <Eye v-if="node.visible" />
              <EyeOff v-else />
            </Button>
          </li>
        </EditorContextMenu>
      </ul>
    </ScrollArea>
  </section>
</template>
