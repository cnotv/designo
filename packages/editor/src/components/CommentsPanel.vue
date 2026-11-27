<script setup lang="ts">
import { Check, MessageSquarePlus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createComment, getCommentPins } from '../editing/presence.ts'
import { screenToWorld } from '../editing/viewport.ts'
import { createNodeId } from '../lib/nodeIds.ts'
import { useEditorStore } from '../stores/editor.ts'
import { useFilesStore } from '../stores/files.ts'

const editor = useEditorStore()
const files = useFilesStore()
const draft = ref('')

const openComments = computed(() =>
  editor.document ? getCommentPins(editor.document, editor.viewport) : []
)
const placeholder = computed(() =>
  editor.selection.length > 0 ? 'Comment on the selection' : 'Comment on the page'
)
const others = computed(() => files.presence)

const nodeName = (nodeId: string | null): string | undefined => {
  const node = nodeId ? editor.document?.nodes[nodeId] : undefined
  return node && node.type !== 'page' ? node.name : undefined
}

const addComment = (): void => {
  const document = editor.document
  if (!document || draft.value.trim() === '') return
  const middle = { x: editor.canvasSize.width / 2, y: editor.canvasSize.height / 2 }
  const comment = createComment(
    document,
    {
      selection: editor.selection,
      pageId: editor.activePageId,
      point: screenToWorld(editor.viewport, middle)
    },
    {
      id: createNodeId('comment'),
      text: draft.value,
      author: files.presenceUser().name,
      createdAt: new Date().toISOString()
    }
  )
  if (editor.commit([{ kind: 'setComment', comment }])) draft.value = ''
}

const resolve = (commentId: string): void => {
  const comment = editor.document?.comments?.[commentId]
  if (comment) editor.commit([{ kind: 'setComment', comment: { ...comment, resolved: true } }])
}

const remove = (commentId: string): void => {
  editor.commit([{ kind: 'deleteComment', id: commentId }])
}
</script>

<template>
  <section class="flex flex-col" aria-label="Comments">
    <div class="flex items-center justify-between px-3 pt-3 pb-1">
      <h2 class="text-muted-foreground font-semibold">Comments</h2>
      <ul v-if="others.length > 0" class="flex items-center gap-1" aria-label="On this file">
        <li
          v-for="person in others"
          :key="person.clientId"
          class="size-2.5 rounded-full"
          :style="{ backgroundColor: person.user.color }"
          :title="person.user.name"
        />
      </ul>
    </div>
    <ol class="flex max-h-56 flex-col gap-1 overflow-y-auto px-2 pb-2">
      <li
        v-for="pin in openComments"
        :key="pin.comment.id"
        class="group hover:bg-accent flex items-start gap-2 rounded-md px-1 py-1"
      >
        <span
          class="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full rounded-bl-none text-xs font-semibold"
        >
          {{ pin.number }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-semibold">
            {{ pin.comment.author }}
            <span v-if="nodeName(pin.comment.nodeId)" class="text-muted-foreground font-normal">
              on {{ nodeName(pin.comment.nodeId) }}
            </span>
          </p>
          <p class="text-xs break-words whitespace-pre-wrap">{{ pin.comment.text }}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="`Resolve comment ${pin.number}`"
          title="Resolve"
          @click="resolve(pin.comment.id)"
        >
          <Check />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          :aria-label="`Delete comment ${pin.number}`"
          title="Delete"
          @click="remove(pin.comment.id)"
        >
          <Trash2 />
        </Button>
      </li>
    </ol>
    <form class="flex items-end gap-1 px-2 pb-2" @submit.prevent="addComment">
      <Textarea
        v-model="draft"
        class="min-h-9 flex-1 text-xs"
        rows="1"
        :placeholder="placeholder"
        aria-label="New comment"
        :disabled="!editor.document"
        @keydown.enter.exact.prevent="addComment"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="Add comment"
        title="Add comment"
        :disabled="draft.trim() === ''"
      >
        <MessageSquarePlus />
      </Button>
    </form>
  </section>
</template>
