<script setup lang="ts">
import { computed } from 'vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getCommentPins } from '../editing/presence.ts'
import { useEditorStore } from '../stores/editor.ts'

const editor = useEditorStore()
const pins = computed(() =>
  editor.document ? getCommentPins(editor.document, editor.viewport) : []
)
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-label="Comment pins">
    <Tooltip v-for="pin in pins" :key="pin.comment.id">
      <TooltipTrigger as-child>
        <button
          type="button"
          class="bg-primary text-primary-foreground pointer-events-auto absolute flex size-6 -translate-y-full items-center justify-center rounded-full rounded-bl-none text-xs font-semibold shadow"
          :style="{ left: `${pin.screen.x}px`, top: `${pin.screen.y}px` }"
          :aria-label="`Comment ${pin.number} by ${pin.comment.author}`"
          data-testid="comment-pin"
        >
          {{ pin.number }}
        </button>
      </TooltipTrigger>
      <TooltipContent class="max-w-64">
        <p class="font-semibold">{{ pin.comment.author }}</p>
        <p class="whitespace-pre-wrap">{{ pin.comment.text }}</p>
      </TooltipContent>
    </Tooltip>
  </div>
</template>
