<script setup lang="ts">
import { File, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utilities'
import { useFilesStore } from '../stores/files.ts'

const DOCS_SELF_HOSTING_URL = 'https://cnotv.github.io/designo/guides/self-hosting'

const files = useFilesStore()
const { documentSummaries, selectedFileId, isDemo } = storeToRefs(files)

const renamingId = ref<string>()
const draftName = ref('')
const renameField = useTemplateRef<{ $el: HTMLInputElement }[]>('renameField')

const startRename = async (fileId: string): Promise<void> => {
  renamingId.value = fileId
  draftName.value = documentSummaries.value.find((summary) => summary.id === fileId)?.name ?? ''
  await nextTick()
  renameField.value?.[0]?.$el.select()
}

const finishRename = (): void => {
  const fileId = renamingId.value
  renamingId.value = undefined
  if (fileId) files.renameFile(fileId, draftName.value)
}

// A new file opens with its name selected, so typing names it and Enter keeps it.
const createAndName = async (): Promise<void> => {
  const fileId = await files.createFile()
  if (fileId) await startRename(fileId)
}

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
  if (target) void files.deleteFile(target.id)
}
</script>

<template>
  <nav aria-label="Files" class="flex flex-col gap-0.5 p-1">
    <div class="flex items-center justify-between px-2 pt-2 pb-1">
      <h2 class="text-muted-foreground font-semibold">Files</h2>
      <Button variant="ghost" size="icon-xs" aria-label="New file" @click="createAndName">
        <Plus />
      </Button>
    </div>
    <p v-if="isDemo" class="text-muted-foreground px-2 pb-1">
      No Designo server is behind this page, so it shows a sample.
      <a class="text-primary underline-offset-2 hover:underline" :href="DOCS_SELF_HOSTING_URL"
        >Self-host Designo</a
      >
      to keep files and connect agents.
    </p>
    <p v-else-if="documentSummaries.length === 0" class="text-muted-foreground px-2 pb-1">
      No files yet. Press <strong>+</strong> to make one, or ask an agent to call
      <code>create_file</code> through the Designo MCP server.
    </p>
    <div
      v-for="summary in documentSummaries"
      :key="summary.id"
      class="group flex items-center gap-0.5"
    >
      <Input
        v-if="renamingId === summary.id"
        ref="renameField"
        v-model="draftName"
        class="h-7 flex-1 text-xs"
        :aria-label="`Name of ${summary.name}`"
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
            'h-7 min-w-0 flex-1 justify-start font-normal',
            summary.id === selectedFileId && 'bg-accent'
          )
        "
        :aria-current="summary.id === selectedFileId ? 'page' : undefined"
        @click="files.selectFile(summary.id)"
        @dblclick="startRename(summary.id)"
      >
        <File class="text-muted-foreground" />
        <span class="truncate">{{ summary.name }}</span>
      </Button>
      <template v-if="renamingId !== summary.id">
        <Button
          variant="ghost"
          size="icon-xs"
          class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          :aria-label="`Rename ${summary.name}`"
          @click="startRename(summary.id)"
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          :aria-label="`Delete ${summary.name}`"
          @click="fileToDelete = { id: summary.id, name: summary.name }"
        >
          <Trash2 />
        </Button>
      </template>
    </div>
  </nav>
  <Dialog v-model:open="isDeleteOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete {{ fileToDelete?.name }}?</DialogTitle>
        <DialogDescription> The file is deleted and cannot be restored. </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="fileToDelete = undefined">Cancel</Button>
        <Button variant="destructive" @click="confirmDelete">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
