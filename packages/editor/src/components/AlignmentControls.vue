<script setup lang="ts">
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween
} from 'lucide-vue-next'
import { computed, type Component } from 'vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEditorContext } from '../composables/editorContext.ts'
import { canAlign, canDistribute } from '../editing/alignment.ts'
import type { AlignKind, DistributeAxis } from '../editing/types.ts'

const { editor } = useEditorContext()

const alignments: { kind: AlignKind; label: string; icon: Component }[] = [
  { kind: 'left', label: 'Align left', icon: AlignStartVertical },
  { kind: 'centerX', label: 'Align horizontal centre', icon: AlignCenterVertical },
  { kind: 'right', label: 'Align right', icon: AlignEndVertical },
  { kind: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { kind: 'centerY', label: 'Align vertical centre', icon: AlignCenterHorizontal },
  { kind: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal }
]

const distributions: { axis: DistributeAxis; label: string; icon: Component }[] = [
  { axis: 'horizontal', label: 'Distribute horizontally', icon: AlignHorizontalSpaceBetween },
  { axis: 'vertical', label: 'Distribute vertically', icon: AlignVerticalSpaceBetween }
]

const alignEnabled = computed(() => {
  const document = editor.document.value
  return document ? canAlign(document, editor.selection.value) : false
})

const distributeEnabled = computed(() => {
  const document = editor.document.value
  return document ? canDistribute(document, editor.selection.value) : false
})
</script>

<template>
  <div class="flex items-center gap-0.5" role="group" aria-label="Align and distribute">
    <Tooltip v-for="entry in alignments" :key="entry.kind">
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="entry.label"
          :disabled="!alignEnabled"
          @click="editor.alignSelection(entry.kind)"
        >
          <component :is="entry.icon" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ entry.label }}</TooltipContent>
    </Tooltip>
    <Separator orientation="vertical" class="mx-1 h-5!" />
    <Tooltip v-for="entry in distributions" :key="entry.axis">
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="entry.label"
          :disabled="!distributeEnabled"
          @click="editor.distributeSelection(entry.axis)"
        >
          <component :is="entry.icon" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ entry.label }}</TooltipContent>
    </Tooltip>
  </div>
</template>
