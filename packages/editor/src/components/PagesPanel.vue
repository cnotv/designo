<script setup lang="ts">
import { STATIONERY_TEMPLATES } from '@designo/core'
import {
  ArrowDown,
  ArrowUp,
  FilePlus,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Trash2
} from 'lucide-vue-next'
import { nextTick, ref, useTemplateRef } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utilities'
import { useEditorStore } from '../stores/editor.ts'

const editor = useEditorStore()

const renamingId = ref<string>()
const draftName = ref('')
const renameField = useTemplateRef<{ $el: HTMLInputElement }[]>('renameField')

const startRename = async (pageId: string, name: string): Promise<void> => {
  renamingId.value = pageId
  draftName.value = name
  await nextTick()
  renameField.value?.[0]?.$el.select()
}

const finishRename = (): void => {
  const pageId = renamingId.value
  renamingId.value = undefined
  if (pageId) editor.renamePage(pageId, draftName.value)
}
</script>

<template>
  <section class="flex max-h-48 flex-col" aria-label="Pages">
    <div class="flex items-center justify-between px-3 pt-3 pb-1">
      <h2 class="text-muted-foreground font-semibold">Pages</h2>
      <div class="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-xs" aria-label="Add page from a template">
              <LayoutTemplate />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" @close-auto-focus.prevent>
            <DropdownMenuItem
              v-for="template in STATIONERY_TEMPLATES"
              :key="template.id"
              @select="editor.addPageFromTemplate(template)"
            >
              {{ template.name }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-xs" aria-label="Add page" @click="editor.addPage()">
          <FilePlus />
        </Button>
      </div>
    </div>
    <ul class="min-h-0 overflow-y-auto px-1 pb-2">
      <li v-for="(page, index) in editor.pages" :key="page.id" class="group flex items-center">
        <Input
          v-if="renamingId === page.id"
          ref="renameField"
          v-model="draftName"
          class="h-7 flex-1 text-xs"
          :aria-label="`Name of ${page.name}`"
          @keydown.enter="finishRename"
          @keydown.escape="renamingId = undefined"
          @blur="finishRename"
        />
        <Button
          v-else
          variant="ghost"
          size="xs"
          :class="
            cn(
              'h-7 flex-1 justify-start font-normal',
              page.id === editor.activePageId && 'bg-primary/15 hover:bg-primary/20'
            )
          "
          :aria-current="page.id === editor.activePageId ? 'page' : undefined"
          @click="editor.showPage(page.id)"
          @dblclick="startRename(page.id, page.name)"
        >
          <span class="truncate">{{ page.name }}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="icon-xs"
              class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              :aria-label="`Actions for ${page.name}`"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" @close-auto-focus.prevent>
            <DropdownMenuItem @select="startRename(page.id, page.name)">
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="index === 0" @select="editor.movePage(page.id, -1)">
              <ArrowUp /> Move earlier
            </DropdownMenuItem>
            <DropdownMenuItem
              :disabled="index === editor.pages.length - 1"
              @select="editor.movePage(page.id, 1)"
            >
              <ArrowDown /> Move later
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              :disabled="editor.pages.length < 2"
              @select="editor.deletePage(page.id)"
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    </ul>
  </section>
</template>
