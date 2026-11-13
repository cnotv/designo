<script setup lang="ts">
import { computed } from 'vue'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useEditorContext } from '../composables/editorContext.ts'
import type { Editor } from '../composables/types.ts'

const { editor } = useEditorContext()

interface MenuEntry {
  label: string
  shortcut: string
  run: (editor: Editor) => void
  destructive?: boolean
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const commandKey = isMac ? '⌘' : 'Ctrl+'
const shiftKey = isMac ? '⇧' : 'Shift+'

const MENU_SECTIONS: readonly (readonly MenuEntry[])[] = [
  [
    {
      label: 'Duplicate',
      shortcut: `${commandKey}D`,
      run: (target) => target.duplicateSelection()
    },
    { label: 'Copy', shortcut: `${commandKey}C`, run: (target) => target.copySelection() },
    { label: 'Cut', shortcut: `${commandKey}X`, run: (target) => target.cutSelection() },
    { label: 'Paste', shortcut: `${commandKey}V`, run: (target) => target.paste() }
  ],
  [
    { label: 'Group', shortcut: `${commandKey}G`, run: (target) => target.groupSelection() },
    {
      label: 'Ungroup',
      shortcut: `${shiftKey}${commandKey}G`,
      run: (target) => target.ungroupSelection()
    }
  ],
  [
    {
      label: 'Bring forward',
      shortcut: `${commandKey}]`,
      run: (target) => target.reorderSelection('forward')
    },
    {
      label: 'Send backward',
      shortcut: `${commandKey}[`,
      run: (target) => target.reorderSelection('backward')
    },
    {
      label: 'Bring to front',
      shortcut: `${shiftKey}${commandKey}]`,
      run: (target) => target.reorderSelection('front')
    },
    {
      label: 'Send to back',
      shortcut: `${shiftKey}${commandKey}[`,
      run: (target) => target.reorderSelection('back')
    }
  ],
  [
    {
      label: 'Delete',
      shortcut: '⌫',
      run: (target) => target.deleteSelection(),
      destructive: true
    }
  ]
]

const hasSelection = computed(() => editor.selection.value.length > 0)
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52">
      <template v-for="(section, index) in MENU_SECTIONS" :key="index">
        <ContextMenuSeparator v-if="index > 0" />
        <ContextMenuItem
          v-for="entry in section"
          :key="entry.label"
          :variant="entry.destructive ? 'destructive' : 'default'"
          :disabled="!hasSelection && entry.label !== 'Paste'"
          @select="entry.run(editor)"
        >
          {{ entry.label }}
          <ContextMenuShortcut>{{ entry.shortcut }}</ContextMenuShortcut>
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
